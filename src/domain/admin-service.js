'use strict';

const { badRequest } = require('./errors');
const { validateConfig, publicGameConfig } = require('../config');
const { addAudit } = require('./records');

const MUTABLE_CONFIG_FIELDS = new Set([
  'targetWinProbabilityBps',
  'feeBps',
  'minBetMinor',
  'maxBetMinor',
  'grossPayoutMultiplier'
]);

class AdminService {
  constructor(store) {
    this.store = store;
  }

  async getConfig() {
    const state = await this.store.read();
    return { ...state.config };
  }

  async updateConfig(actorUserId, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw badRequest('INVALID_CONFIG', 'Configuration patch must be an object');
    }

    return this.store.update((state) => {
      const next = { ...state.config };
      const changed = {};
      for (const [key, value] of Object.entries(patch)) {
        if (!MUTABLE_CONFIG_FIELDS.has(key)) throw badRequest('INVALID_CONFIG_FIELD', `Config field ${key} is not mutable`);
        if (!Number.isSafeInteger(value)) throw badRequest('INVALID_CONFIG', `${key} must be an integer`);
        next[key] = value;
        changed[key] = value;
      }
      try {
        validateConfig(next);
      } catch (error) {
        throw badRequest('INVALID_CONFIG', error.message);
      }
      state.config = next;
      addAudit(state, {
        type: 'CONFIG_UPDATED',
        actorUserId,
        details: changed
      });
      return { ...state.config };
    });
  }

  async getStats() {
    const state = await this.store.read();
    const users = Object.values(state.users);
    const rounds = Object.values(state.rounds);
    const settledRounds = rounds.filter((round) => round.status === 'SETTLED');
    const totalWalletBalanceMinor = Object.values(state.wallets).reduce((total, wallet) => total + wallet.balanceMinor, 0);
    return {
      users: users.length,
      admins: users.filter((user) => user.role === 'ADMIN').length,
      wallets: Object.keys(state.wallets).length,
      totalWalletBalanceMinor,
      totalTransactions: state.transactions.length,
      totalRounds: rounds.length,
      openRounds: rounds.filter((round) => round.status === 'OPEN').length,
      recoverableRounds: rounds.filter((round) => round.status === 'RECOVERABLE').length,
      settlingRounds: rounds.filter((round) => round.status === 'SETTLING').length,
      settledRounds: settledRounds.length,
      wins: settledRounds.filter((round) => round.outcome === 'WIN').length,
      losses: settledRounds.filter((round) => round.outcome === 'LOSS').length,
      totalBetMinor: settledRounds.reduce((sum, round) => sum + round.betMinor, 0),
      totalFeeMinor: settledRounds.reduce((sum, round) => sum + round.feeMinor, 0),
      totalPayoutMinor: settledRounds.reduce((sum, round) => sum + round.payoutMinor, 0),
      totalNetMinor: settledRounds.reduce((sum, round) => sum + round.netMinor, 0),
      config: publicGameConfig(state.config)
    };
  }

  async getAudit({ limit = 100, type, userId, roundId } = {}) {
    const state = await this.store.read();
    const boundedLimit = Math.max(1, Math.min(500, Number.isInteger(limit) ? limit : 100));
    const audit = state.audit
      .filter((event) => !type || event.type === type)
      .filter((event) => !userId || event.actorUserId === userId)
      .filter((event) => !roundId || event.entityId === roundId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, boundedLimit);
    const rounds = roundId
      ? Object.values(state.rounds).filter((round) => round.id === roundId)
      : [];
    return {
      audit,
      rounds: rounds.map((round) => ({ ...round }))
    };
  }
}

module.exports = {
  AdminService,
  MUTABLE_CONFIG_FIELDS
};
