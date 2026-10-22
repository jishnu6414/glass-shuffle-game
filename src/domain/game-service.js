'use strict';

const { conflict, badRequest, notFound } = require('./errors');
const {
  assertMinorUnits,
  calculateFeeMinor,
  calculateGrossPayoutMinor,
  calculateNetMinor
} = require('./money');
const {
  createRoundRandomness,
  deriveRoundRandomness,
  sha256
} = require('./randomness');
const { addAudit, addTransaction, id, publicWallet } = require('./records');
const { sha256: requestSha256 } = require('../security');
const { nowIso } = require('../storage/state');
const {
  requireIdempotencyKey,
  idempotentResult,
  saveIdempotentResult
} = require('./wallet-service');

function validateSelectedGlass(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > 2) {
    throw badRequest('INVALID_GLASS', 'selectedGlass must be 0, 1, 2, or null for a timeout');
  }
  return value;
}

function publicRound(round, { includeAudit = false } = {}) {
  const result = {
    id: round.id,
    userId: round.userId,
    status: round.status,
    betMinor: round.betMinor,
    feeMinor: round.feeMinor,
    totalDebitedMinor: round.totalDebitedMinor,
    grossPayoutMultiplier: round.grossPayoutMultiplier,
    targetWinProbabilityBps: round.targetWinProbabilityBps,
    serverSeedHash: round.serverSeedHash,
    selectedGlass: round.selectedGlass,
    winningGlass: round.status === 'SETTLED' ? round.winningGlass : null,
    outcome: round.status === 'SETTLED' ? round.outcome : null,
    payoutMinor: round.status === 'SETTLED' ? round.payoutMinor : null,
    netMinor: round.status === 'SETTLED' ? round.netMinor : null,
    settlementReason: round.status === 'SETTLED' ? round.settlementReason : null,
    auditHash: round.status === 'SETTLED' ? round.auditHash : null,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    settledAt: round.settledAt || null
  };

  if (includeAudit && round.status === 'SETTLED') {
    result.serverSeed = round.serverSeed;
    result.targetRoll = round.targetRoll;
    result.targetWin = round.targetWin;
    result.outcomeDigest = round.outcomeDigest;
  }
  return result;
}

function auditRoundHash(round) {
  return sha256(JSON.stringify({
    id: round.id,
    userId: round.userId,
    betMinor: round.betMinor,
    feeMinor: round.feeMinor,
    serverSeedHash: round.serverSeedHash,
    serverSeed: round.serverSeed,
    targetRoll: round.targetRoll,
    targetWin: round.targetWin,
    selectedGlass: round.selectedGlass,
    winningGlass: round.winningGlass,
    outcome: round.outcome,
    payoutMinor: round.payoutMinor,
    netMinor: round.netMinor,
    outcomeDigest: round.outcomeDigest
  }));
}

function findRound(state, userId, roundId) {
  const round = state.rounds[roundId];
  if (!round || round.userId !== userId) throw notFound('Round not found');
  return round;
}

class GameService {
  constructor(store) {
    this.store = store;
  }

  async recoverStaleRounds() {
    return this.store.update((state) => {
      let recovered = 0;
      for (const round of Object.values(state.rounds)) {
        if (round.status === 'SETTLING') {
          round.status = 'RECOVERABLE';
          round.updatedAt = nowIso();
          recovered += 1;
          addAudit(state, {
            type: 'ROUND_RECOVERED',
            entityId: round.id,
            details: { previousStatus: 'SETTLING' }
          });
        }
      }
      return recovered;
    });
  }

  async placeBet(userId, { amountMinor }, idempotencyKey) {
    assertMinorUnits(amountMinor, 'amountMinor');
    const key = requireIdempotencyKey(idempotencyKey);
    const scope = `bet:${userId}:place:${key}`;
    const hash = requestSha256(JSON.stringify({ amountMinor }));

    return this.store.update((state) => {
      const previous = idempotentResult(state, scope, hash);
      if (previous) return previous;
      const config = state.config;
      if (amountMinor < config.minBetMinor || amountMinor > config.maxBetMinor) {
        throw badRequest(
          'BET_OUT_OF_RANGE',
          `Bet must be between ${config.minBetMinor} and ${config.maxBetMinor} minor units`,
          { minBetMinor: config.minBetMinor, maxBetMinor: config.maxBetMinor }
        );
      }
      const wallet = state.wallets[userId];
      if (!wallet) throw notFound('Wallet not found');
      const feeMinor = calculateFeeMinor(amountMinor, config.feeBps);
      const totalDebitedMinor = amountMinor + feeMinor;
      if (!Number.isSafeInteger(totalDebitedMinor)) throw badRequest('INVALID_MONEY', 'Bet total exceeds safe integer range');
      if (wallet.balanceMinor < totalDebitedMinor) throw conflict('INSUFFICIENT_FUNDS', 'Insufficient wallet funds for bet and fee');

      const roundId = id();
      const createdAt = nowIso();
      const randomness = createRoundRandomness({
        roundId,
        targetWinProbabilityBps: config.targetWinProbabilityBps
      });
      const round = {
        id: roundId,
        userId,
        status: 'OPEN',
        betMinor: amountMinor,
        feeMinor,
        totalDebitedMinor,
        grossPayoutMultiplier: config.grossPayoutMultiplier,
        targetWinProbabilityBps: config.targetWinProbabilityBps,
        serverSeed: randomness.serverSeed,
        serverSeedHash: randomness.serverSeedHash,
        targetRoll: randomness.targetRoll,
        targetWin: randomness.targetWin,
        selectedGlass: null,
        winningGlass: null,
        outcome: null,
        payoutMinor: 0,
        netMinor: null,
        settlementReason: null,
        outcomeDigest: null,
        auditHash: null,
        createdAt,
        updatedAt: createdAt,
        settledAt: null
      };

      wallet.balanceMinor -= totalDebitedMinor;
      wallet.version += 1;
      wallet.updatedAt = createdAt;
      state.rounds[roundId] = round;
      const transaction = addTransaction(state, {
        userId,
        type: 'BET_DEBIT',
        amountMinor: -totalDebitedMinor,
        balanceAfterMinor: wallet.balanceMinor,
        referenceId: roundId,
        metadata: {
          betMinor: amountMinor,
          feeMinor,
          feeBps: config.feeBps,
          mode: 'sandbox'
        }
      });
      addAudit(state, {
        type: 'BET_PLACED',
        actorUserId: userId,
        entityId: roundId,
        details: {
          amountMinor,
          feeMinor,
          totalDebitedMinor,
          serverSeedHash: randomness.serverSeedHash,
          transactionId: transaction.id
        }
      });

      const result = {
        round: publicRound(round),
        wallet: publicWallet(wallet)
      };
      saveIdempotentResult(state, scope, hash, result);
      return result;
    });
  }

  async settleBet(userId, roundId, { selectedGlass = null } = {}, idempotencyKey) {
    const pick = validateSelectedGlass(selectedGlass);
    const key = requireIdempotencyKey(idempotencyKey);
    const scope = `bet:${userId}:settle:${roundId}:${key}`;
    const hash = requestSha256(JSON.stringify({ roundId, selectedGlass: pick }));

    return this.store.update((state) => {
      const previous = idempotentResult(state, scope, hash);
      if (previous) return previous;
      const round = findRound(state, userId, roundId);
      const wallet = state.wallets[userId];

      if (round.status === 'SETTLED') {
        const result = { round: publicRound(round, { includeAudit: true }), wallet: publicWallet(wallet) };
        saveIdempotentResult(state, scope, hash, result);
        return result;
      }
      if (!['OPEN', 'RECOVERABLE', 'SETTLING'].includes(round.status)) {
        throw conflict('ROUND_NOT_SETTLEABLE', `Round is ${round.status.toLowerCase()}`);
      }

      round.status = 'SETTLING';
      round.updatedAt = nowIso();
      const derived = deriveRoundRandomness({
        roundId: round.id,
        serverSeed: round.serverSeed,
        targetWinProbabilityBps: round.targetWinProbabilityBps,
        selectedGlass: pick
      });
      const won = pick !== null && pick === derived.winningGlass;
      const payoutMinor = won ? calculateGrossPayoutMinor(round.betMinor, round.grossPayoutMultiplier) : 0;
      const netMinor = calculateNetMinor({
        betMinor: round.betMinor,
        feeMinor: round.feeMinor,
        payoutMinor,
        won
      });

      if (payoutMinor > 0) {
        const nextBalance = wallet.balanceMinor + payoutMinor;
        if (!Number.isSafeInteger(nextBalance)) throw badRequest('INVALID_MONEY', 'Payout exceeds safe integer range');
        wallet.balanceMinor = nextBalance;
        wallet.version += 1;
        wallet.updatedAt = nowIso();
      }

      round.status = 'SETTLED';
      round.selectedGlass = pick;
      round.winningGlass = derived.winningGlass;
      round.outcome = won ? 'WIN' : 'LOSS';
      round.payoutMinor = payoutMinor;
      round.netMinor = netMinor;
      round.settlementReason = pick === null ? 'TIMEOUT' : 'PICK';
      round.outcomeDigest = derived.outcomeDigest;
      round.updatedAt = nowIso();
      round.settledAt = round.updatedAt;
      round.auditHash = auditRoundHash(round);

      const transaction = addTransaction(state, {
        userId,
        type: 'BET_SETTLEMENT',
        amountMinor: payoutMinor,
        balanceAfterMinor: wallet.balanceMinor,
        referenceId: round.id,
        metadata: {
          outcome: round.outcome,
          selectedGlass: pick,
          winningGlass: round.winningGlass,
          payoutMinor,
          netMinor,
          mode: 'sandbox'
        }
      });
      addAudit(state, {
        type: 'BET_SETTLED',
        actorUserId: userId,
        entityId: round.id,
        details: {
          outcome: round.outcome,
          payoutMinor,
          netMinor,
          selectedGlass: pick,
          winningGlass: round.winningGlass,
          auditHash: round.auditHash,
          transactionId: transaction.id
        }
      });

      const result = {
        round: publicRound(round, { includeAudit: true }),
        wallet: publicWallet(wallet)
      };
      saveIdempotentResult(state, scope, hash, result);
      return result;
    });
  }

  async getRound(userId, roundId) {
    const state = await this.store.read();
    return publicRound(findRound(state, userId, roundId), { includeAudit: true });
  }

  async getHistory(userId, limit = 100) {
    const state = await this.store.read();
    const boundedLimit = Math.max(1, Math.min(state.config.maxHistoryItems || 100, Number.isInteger(limit) ? limit : 100));
    return Object.values(state.rounds)
      .filter((round) => round.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, boundedLimit)
      .map((round) => publicRound(round, { includeAudit: true }));
  }

  async getStats() {
    const state = await this.store.read();
    const rounds = Object.values(state.rounds);
    const settled = rounds.filter((round) => round.status === 'SETTLED');
    const stats = settled.reduce((summary, round) => {
      summary.settledRounds += 1;
      summary.totalBetMinor += round.betMinor;
      summary.totalFeeMinor += round.feeMinor;
      summary.totalPayoutMinor += round.payoutMinor;
      summary.totalNetMinor += round.netMinor;
      if (round.outcome === 'WIN') summary.wins += 1;
      if (round.outcome === 'LOSS') summary.losses += 1;
      return summary;
    }, {
      totalRounds: rounds.length,
      openRounds: rounds.filter((round) => round.status === 'OPEN').length,
      recoverableRounds: rounds.filter((round) => round.status === 'RECOVERABLE').length,
      settlingRounds: rounds.filter((round) => round.status === 'SETTLING').length,
      settledRounds: 0,
      wins: 0,
      losses: 0,
      totalBetMinor: 0,
      totalFeeMinor: 0,
      totalPayoutMinor: 0,
      totalNetMinor: 0
    });
    return stats;
  }
}

module.exports = {
  GameService,
  validateSelectedGlass,
  publicRound,
  auditRoundHash
};
