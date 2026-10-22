'use strict';

const { badRequest, conflict, notFound } = require('./errors');
const { parsePositiveMinorUnits } = require('./money');
const { addAudit, addTransaction, publicWallet } = require('./records');
const { sha256 } = require('../security');
const { nowIso } = require('../storage/state');

function requireIdempotencyKey(value) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 200) {
    throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A 1-200 character Idempotency-Key is required');
  }
  return value.trim();
}

function requestHash(payload) {
  return sha256(JSON.stringify(payload));
}

function findWallet(state, userId) {
  const wallet = state.wallets[userId];
  if (!wallet) throw notFound('Wallet not found');
  return wallet;
}

function idempotentResult(state, scope, hash) {
  const existing = state.idempotency[scope];
  if (!existing) return null;
  if (existing.requestHash !== hash) {
    throw conflict('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different request');
  }
  return existing.result;
}

function saveIdempotentResult(state, scope, hash, result) {
  state.idempotency[scope] = {
    requestHash: hash,
    result,
    createdAt: nowIso()
  };
  const keys = Object.keys(state.idempotency);
  if (keys.length > 20_000) {
    keys.sort((a, b) => Date.parse(state.idempotency[a].createdAt) - Date.parse(state.idempotency[b].createdAt));
    for (const key of keys.slice(0, keys.length - 20_000)) delete state.idempotency[key];
  }
}

class WalletService {
  constructor(store) {
    this.store = store;
  }

  async getWallet(userId) {
    const state = await this.store.read();
    return publicWallet(findWallet(state, userId));
  }

  async getTransactions(userId, limit = 100) {
    const state = await this.store.read();
    const boundedLimit = Math.max(1, Math.min(500, Number.isInteger(limit) ? limit : 100));
    return state.transactions
      .filter((transaction) => transaction.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, boundedLimit);
  }

  async deposit(userId, { amountMinor, mode = 'sandbox' }, idempotencyKey) {
    const amount = parsePositiveMinorUnits(amountMinor);
    if (mode !== 'sandbox') throw badRequest('SANDBOX_ONLY', 'Deposits are available only in sandbox mode');
    const key = requireIdempotencyKey(idempotencyKey);
    const scope = `wallet:${userId}:deposit:${key}`;
    const hash = requestHash({ amountMinor: amount, mode });

    return this.store.update((state) => {
      const previous = idempotentResult(state, scope, hash);
      if (previous) return previous;
      const wallet = findWallet(state, userId);
      this._ensureSafeBalance(wallet.balanceMinor + amount);
      wallet.balanceMinor += amount;
      wallet.version += 1;
      wallet.updatedAt = nowIso();
      const transaction = addTransaction(state, {
        userId,
        type: 'SANDBOX_DEPOSIT',
        amountMinor: amount,
        balanceAfterMinor: wallet.balanceMinor,
        referenceId: null,
        metadata: { mode: 'sandbox', provider: 'sandbox', simulated: true }
      });
      addAudit(state, {
        type: 'SANDBOX_DEPOSIT',
        actorUserId: userId,
        entityId: transaction.id,
        details: { amountMinor: amount, mode: 'sandbox' }
      });
      const result = {
        status: 'SANDBOX_CREDITED',
        sandbox: true,
        mode: 'sandbox',
        wallet: publicWallet(wallet),
        transaction
      };
      saveIdempotentResult(state, scope, hash, result);
      return result;
    });
  }

  async withdraw(userId, { amountMinor, mode = 'sandbox' }, idempotencyKey) {
    const amount = parsePositiveMinorUnits(amountMinor);
    if (mode !== 'sandbox') throw badRequest('SANDBOX_ONLY', 'Withdrawals are available only in sandbox mode');
    const key = requireIdempotencyKey(idempotencyKey);
    const scope = `wallet:${userId}:withdraw:${key}`;
    const hash = requestHash({ amountMinor: amount, mode });

    return this.store.update((state) => {
      const previous = idempotentResult(state, scope, hash);
      if (previous) return previous;
      const wallet = findWallet(state, userId);
      if (wallet.balanceMinor < amount) throw conflict('INSUFFICIENT_FUNDS', 'Insufficient wallet funds');
      wallet.balanceMinor -= amount;
      wallet.version += 1;
      wallet.updatedAt = nowIso();
      const transaction = addTransaction(state, {
        userId,
        type: 'SANDBOX_WITHDRAWAL',
        amountMinor: -amount,
        balanceAfterMinor: wallet.balanceMinor,
        referenceId: null,
        metadata: { mode: 'sandbox', provider: 'sandbox', simulated: true }
      });
      addAudit(state, {
        type: 'SANDBOX_WITHDRAWAL',
        actorUserId: userId,
        entityId: transaction.id,
        details: { amountMinor: amount, mode: 'sandbox' }
      });
      const result = {
        status: 'SANDBOX_DEBITED',
        sandbox: true,
        mode: 'sandbox',
        wallet: publicWallet(wallet),
        transaction
      };
      saveIdempotentResult(state, scope, hash, result);
      return result;
    });
  }

  _ensureSafeBalance(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('wallet balance exceeds safe integer range');
  }
}

module.exports = {
  WalletService,
  requireIdempotencyKey,
  requestHash,
  idempotentResult,
  saveIdempotentResult
};
