'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_KEY_BYTES = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    const error = new Error('Password must be between 8 and 200 characters');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }
}

async function hashPassword(password) {
  assertPassword(password);
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, PASSWORD_KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nText, rText, pText, saltText, hashText] = parts;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (![N, r, p].every(Number.isSafeInteger) || N < 2 || r < 1 || p < 1) return false;

  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    const actual = Buffer.from(await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 32 * 1024 * 1024
    }));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signSessionId(sessionId, secret) {
  const signature = crypto.createHmac('sha256', secret).update(sessionId).digest('base64url');
  return `${sessionId}.${signature}`;
}

function verifySignedSession(value, secret) {
  if (typeof value !== 'string') return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const sessionId = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = crypto.createHmac('sha256', secret).update(sessionId).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  return sessionId;
}

function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

function createSessionCookie(sessionId, secret, { maxAgeSeconds, secure = false } = {}) {
  const value = signSessionId(sessionId, secret);
  const attributes = [
    `gs_session=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds || 0))}`
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

module.exports = {
  assertPassword,
  hashPassword,
  verifyPassword,
  sha256,
  signSessionId,
  verifySignedSession,
  parseCookies,
  createSessionCookie
};
