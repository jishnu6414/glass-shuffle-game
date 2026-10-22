'use strict';

const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

function createInitialState({ config, sessionSecret }) {
  return {
    schemaVersion: 1,
    meta: {
      sessionSecret: sessionSecret || crypto.randomBytes(32).toString('base64url'),
      createdAt: nowIso()
    },
    config: { ...config },
    users: {},
    wallets: {},
    rounds: {},
    transactions: [],
    sessions: {},
    idempotency: {},
    audit: []
  };
}

function normalizeState(state, { config, sessionSecret } = {}) {
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  if (!state.meta.sessionSecret) {
    state.meta.sessionSecret = sessionSecret || crypto.randomBytes(32).toString('base64url');
  }
  if (!state.meta.createdAt) state.meta.createdAt = nowIso();
  if (!state.config || typeof state.config !== 'object') state.config = { ...config };
  else if (config) state.config = { ...config, ...state.config, mode: 'sandbox' };
  if (!state.users || typeof state.users !== 'object') state.users = {};
  if (!state.wallets || typeof state.wallets !== 'object') state.wallets = {};
  if (!state.rounds || typeof state.rounds !== 'object') state.rounds = {};
  if (!Array.isArray(state.transactions)) state.transactions = [];
  if (!state.sessions || typeof state.sessions !== 'object') state.sessions = {};
  if (!state.idempotency || typeof state.idempotency !== 'object') state.idempotency = {};
  if (!Array.isArray(state.audit)) state.audit = [];
  if (!Number.isInteger(state.schemaVersion)) state.schemaVersion = 1;
  return state;
}

module.exports = {
  createInitialState,
  normalizeState,
  nowIso
};
