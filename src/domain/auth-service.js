'use strict';

const crypto = require('node:crypto');
const {
  hashPassword,
  verifyPassword,
  sha256,
  parseCookies,
  verifySignedSession,
  createSessionCookie
} = require('../security');
const { badRequest, conflict, unauthorized } = require('./errors');
const { addAudit, id, publicUser, publicWallet } = require('./records');
const { nowIso } = require('../storage/state');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  if (typeof email !== 'string') throw badRequest('INVALID_EMAIL', 'email is required');
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw badRequest('INVALID_EMAIL', 'email must be a valid email address');
  }
  return normalized;
}

function cleanupSessions(state, now = Date.now()) {
  for (const [sessionHash, session] of Object.entries(state.sessions)) {
    if (!session || Date.parse(session.expiresAt) <= now || !state.users[session.userId]) {
      delete state.sessions[sessionHash];
    }
  }
}

function createSession(state, userId, sessionTtlMs) {
  const rawSessionId = crypto.randomBytes(32).toString('base64url');
  const sessionHash = sha256(rawSessionId);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  state.sessions[sessionHash] = { userId, createdAt, expiresAt };
  return {
    cookie: createSessionCookie(rawSessionId, state.meta.sessionSecret, {
      maxAgeSeconds: Math.floor(sessionTtlMs / 1000),
      secure: state.config.cookieSecure === true
    }),
    session: { createdAt, expiresAt }
  };
}

class AuthService {
  constructor(store, config, { adminEmails = [] } = {}) {
    this.store = store;
    this.config = config;
    this.adminEmails = new Set(adminEmails.map((email) => normalizeEmail(email)));
  }

  async register({ email, password, displayName = '' }) {
    const normalizedEmail = normalizeEmail(email);
    let passwordHash;
    try {
      passwordHash = await hashPassword(password);
    } catch (error) {
      if (error.code === 'INVALID_PASSWORD') throw badRequest('INVALID_PASSWORD', error.message);
      throw error;
    }
    const cleanDisplayName = this._displayName(displayName, normalizedEmail);

    return this.store.update((state) => {
      cleanupSessions(state);
      if (Object.values(state.users).some((user) => user.email === normalizedEmail)) {
        throw conflict('EMAIL_IN_USE', 'An account with that email already exists');
      }

      const userId = id();
      const createdAt = nowIso();
      const role = this.adminEmails.has(normalizedEmail) ? 'ADMIN' : 'USER';
      const user = {
        id: userId,
        email: normalizedEmail,
        displayName: cleanDisplayName,
        passwordHash,
        role,
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: null
      };
      const wallet = {
        userId,
        balanceMinor: state.config.initialBalanceMinor,
        currency: state.config.currency,
        mode: 'sandbox',
        version: 0,
        updatedAt: createdAt
      };
      state.users[userId] = user;
      state.wallets[userId] = wallet;
      const session = createSession(state, userId, state.config.sessionTtlMs);
      addAudit(state, {
        type: 'USER_REGISTERED',
        actorUserId: userId,
        entityId: userId,
        details: { role, sandboxInitialBalanceMinor: wallet.balanceMinor }
      });
      return {
        user: publicUser(user),
        wallet: publicWallet(wallet),
        sessionCookie: session.cookie,
        session: session.session
      };
    });
  }

  async login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const snapshot = await this.store.read();
    const user = Object.values(snapshot.users).find((candidate) => candidate.email === normalizedEmail);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Invalid email or password');
    }

    return this.store.update((state) => {
      cleanupSessions(state);
      const currentUser = state.users[user.id];
      if (!currentUser) throw unauthorized('Invalid email or password');
      const timestamp = nowIso();
      currentUser.lastLoginAt = timestamp;
      currentUser.updatedAt = timestamp;
      const session = createSession(state, currentUser.id, state.config.sessionTtlMs);
      addAudit(state, {
        type: 'USER_LOGIN',
        actorUserId: currentUser.id,
        entityId: currentUser.id
      });
      return {
        user: publicUser(currentUser),
        wallet: publicWallet(state.wallets[currentUser.id]),
        sessionCookie: session.cookie,
        session: session.session
      };
    });
  }

  async logout(cookieHeader) {
    const snapshot = await this.store.read();
    const sessionId = this._sessionId(cookieHeader, snapshot);
    if (sessionId) {
      const sessionHash = sha256(sessionId);
      await this.store.update((state) => {
        const session = state.sessions[sessionHash];
        if (session) {
          delete state.sessions[sessionHash];
          addAudit(state, { type: 'USER_LOGOUT', actorUserId: session.userId, entityId: session.userId });
        }
      });
    }
    return {
      clearCookie: createSessionCookie('', snapshot.meta.sessionSecret, {
        maxAgeSeconds: 0,
        secure: snapshot.config.cookieSecure === true
      })
    };
  }

  async getSession(cookieHeader) {
    const snapshot = await this.store.read();
    const sessionId = this._sessionId(cookieHeader, snapshot);
    if (!sessionId) return null;
    const session = snapshot.sessions[sha256(sessionId)];
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = snapshot.users[session.userId];
    if (!user) return null;
    return { user: publicUser(user), session };
  }

  async updateProfile(userId, { displayName }) {
    if (displayName === undefined) throw badRequest('NO_CHANGES', 'displayName is required');
    const cleanDisplayName = this._displayName(displayName, null);
    return this.store.update((state) => {
      const user = state.users[userId];
      if (!user) throw unauthorized();
      user.displayName = cleanDisplayName;
      user.updatedAt = nowIso();
      addAudit(state, { type: 'PROFILE_UPDATED', actorUserId: userId, entityId: userId });
      return publicUser(user);
    });
  }

  _sessionId(cookieHeader, state) {
    const cookies = parseCookies(cookieHeader);
    return verifySignedSession(cookies.gs_session, state.meta.sessionSecret);
  }

  _displayName(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback || 'Player';
    if (typeof value !== 'string') throw badRequest('INVALID_DISPLAY_NAME', 'displayName must be text');
    const clean = value.trim();
    if (!clean || clean.length > 80) throw badRequest('INVALID_DISPLAY_NAME', 'displayName must be 1-80 characters');
    return clean;
  }
}

module.exports = {
  AuthService,
  normalizeEmail,
  cleanupSessions
};
