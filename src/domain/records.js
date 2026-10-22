'use strict';

const crypto = require('node:crypto');
const { nowIso } = require('../storage/state');

function id() {
  return crypto.randomUUID();
}

function addAudit(state, { type, actorUserId = null, entityId = null, details = {} }) {
  const event = {
    id: id(),
    type,
    actorUserId,
    entityId,
    details,
    createdAt: nowIso()
  };
  state.audit.push(event);
  if (state.audit.length > 10_000) state.audit.splice(0, state.audit.length - 10_000);
  return event;
}

function addTransaction(state, transaction) {
  const entry = {
    id: id(),
    createdAt: nowIso(),
    sandbox: true,
    ...transaction
  };
  state.transactions.push(entry);
  if (state.transactions.length > 50_000) state.transactions.splice(0, state.transactions.length - 50_000);
  return entry;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

function publicWallet(wallet) {
  if (!wallet) return null;
  return {
    userId: wallet.userId,
    balanceMinor: wallet.balanceMinor,
    currency: wallet.currency,
    mode: wallet.mode,
    sandbox: true,
    version: wallet.version,
    updatedAt: wallet.updatedAt
  };
}

module.exports = {
  id,
  addAudit,
  addTransaction,
  publicUser,
  publicWallet
};
