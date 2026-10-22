'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const { loadConfig, publicGameConfig } = require('./config');
const { AppError, badRequest, unauthorized, forbidden, notFound, tooManyRequests } = require('./domain/errors');
const { JsonStore } = require('./storage/json-store');
const { createInitialState, normalizeState } = require('./storage/state');
const { AuthService } = require('./domain/auth-service');
const { WalletService } = require('./domain/wallet-service');
const { GameService } = require('./domain/game-service');
const { AdminService } = require('./domain/admin-service');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

class RequestGuard {
  constructor({ perMinute = 120, maxEntries = 10_000 } = {}) {
    this.perMinute = perMinute;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  check(key) {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || now - entry.startedAt >= 60_000) {
      entry = { startedAt: now, count: 0 };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.perMinute) throw tooManyRequests();
    if (this.entries.size > this.maxEntries) this.prune(now);
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (now - entry.startedAt >= 60_000) this.entries.delete(key);
    }
    if (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.entries()]
        .sort((a, b) => a[1].startedAt - b[1].startedAt)
        .slice(0, this.entries.size - this.maxEntries);
      for (const [key] of oldest) this.entries.delete(key);
    }
  }
}

function parseLimit(value, fallback = 100) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw badRequest('INVALID_LIMIT', 'limit must be a positive integer');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw badRequest('INVALID_LIMIT', 'limit must be a positive integer');
  return parsed;
}

function parsePathSegments(pathname) {
  const apiPath = pathname === '/api' ? '' : pathname.replace(/^\/api\/?/, '');
  return apiPath.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function jsonResponse(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const responseHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  };
  if (body !== undefined) responseHeaders['Content-Length'] = Buffer.byteLength(payload);
  res.writeHead(status, responseHeaders);
  if (payload) res.end(payload);
  else res.end();
}

function success(res, body, status = 200, headers = {}) {
  jsonResponse(res, status, body, headers);
}

function errorBody(error) {
  if (error instanceof AppError) {
    const result = { error: { code: error.code, message: error.message } };
    if (error.details !== undefined) result.error.details = error.details;
    return { status: error.status, body: result };
  }
  if (error instanceof SyntaxError) {
    return { status: 400, body: { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } } };
}

async function readJsonBody(req, maxBytes) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') return {};
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AppError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds the configured limit');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new AppError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds the configured limit');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('INVALID_BODY', 'Request body must be a JSON object');
  }
  return body;
}

function clientKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveStatic(req, res, staticDir, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw notFound();
  }
  if (decodedPath === '/') decodedPath = '/index.html';
  const root = path.resolve(staticDir);
  const candidate = path.resolve(root, `.${decodedPath}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw notFound();
  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch (error) {
    if (error.code === 'ENOENT') throw notFound();
    throw error;
  }
  if (!stat.isFile()) throw notFound();
  res.writeHead(200, {
    'Content-Type': contentTypeFor(candidate),
    'Content-Length': stat.size,
    'Cache-Control': path.extname(candidate) === '.html' ? 'no-store' : 'public, max-age=300'
  });
  if (req.method === 'HEAD') return res.end();
  const file = await fs.readFile(candidate);
  return res.end(file);
}

async function createApplication(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const staticDir = options.staticDir || projectRoot;
  const dataDir = options.dataDir || path.join(projectRoot, 'data');
  const config = loadConfig(options.env || process.env, {
    ...(options.config || {}),
    cookieSecure: options.secureCookies === undefined
      ? (options.env || process.env).NODE_ENV === 'production'
      : options.secureCookies
  });
  const store = new JsonStore(
    path.join(dataDir, 'state.json'),
    () => createInitialState({ config, sessionSecret: options.sessionSecret })
  );
  await store.init();
  await store.update((state) => normalizeState(state, { config, sessionSecret: options.sessionSecret }));

  const adminEmails = options.adminEmails || String((options.env || process.env).GS_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  const auth = new AuthService(store, config, { adminEmails });
  const wallet = new WalletService(store);
  const game = new GameService(store);
  const admin = new AdminService(store);
  await game.recoverStaleRounds();
  const requestGuard = new RequestGuard({ perMinute: config.rateLimitPerMinute });

  async function currentUser(req) {
    const session = await auth.getSession(req.headers.cookie);
    if (!session) throw unauthorized();
    return session.user;
  }

  async function currentAdmin(req) {
    const user = await currentUser(req);
    if (user.role !== 'ADMIN') throw forbidden('Administrator access required');
    return user;
  }

  async function handleApi(req, res, url) {
    const segments = parsePathSegments(url.pathname);
    const body = await readJsonBody(req, config.maxBodyBytes);
    const idempotencyKey = req.headers['idempotency-key'];

    if (req.method === 'GET' && segments.length === 1 && segments[0] === 'health') {
      return success(res, { ok: true, service: 'glass-shuffle-backend', mode: 'sandbox' });
    }
    if (req.method === 'GET' && segments.length === 2 && segments[0] === 'game' && segments[1] === 'config') {
      const state = await store.read();
      return success(res, publicGameConfig(state.config));
    }

    if (segments[0] === 'auth') {
      if (req.method === 'POST' && segments[1] === 'register') {
        const result = await auth.register(requireObject(body));
        return success(res, { user: result.user, wallet: result.wallet, session: result.session }, 201, { 'Set-Cookie': result.sessionCookie });
      }
      if (req.method === 'POST' && segments[1] === 'login') {
        const result = await auth.login(requireObject(body));
        return success(res, { user: result.user, wallet: result.wallet, session: result.session }, 200, { 'Set-Cookie': result.sessionCookie });
      }
      if (req.method === 'POST' && segments[1] === 'logout') {
        const result = await auth.logout(req.headers.cookie);
        return success(res, { ok: true }, 200, { 'Set-Cookie': result.clearCookie });
      }
      if (req.method === 'GET' && segments[1] === 'me') {
        const session = await auth.getSession(req.headers.cookie);
        return success(res, { user: session ? session.user : null });
      }
      throw notFound('Auth endpoint not found');
    }

    const user = await currentUser(req);

    if (segments[0] === 'profile') {
      if (req.method === 'GET' && segments.length === 1) return success(res, { user });
      if (['PATCH', 'PUT'].includes(req.method) && segments.length === 1) {
        const updated = await auth.updateProfile(user.id, requireObject(body));
        return success(res, { user: updated });
      }
      throw notFound('Profile endpoint not found');
    }

    if (segments[0] === 'wallet') {
      if (req.method === 'GET' && segments.length === 1) return success(res, { wallet: await wallet.getWallet(user.id) });
      if (req.method === 'GET' && segments[1] === 'transactions') {
        return success(res, { transactions: await wallet.getTransactions(user.id, parseLimit(url.searchParams.get('limit'))) });
      }
      if (req.method === 'POST' && segments[1] === 'deposits') {
        return success(res, await wallet.deposit(user.id, requireObject(body), idempotencyKey), 201);
      }
      if (req.method === 'POST' && segments[1] === 'withdrawals') {
        return success(res, await wallet.withdraw(user.id, requireObject(body), idempotencyKey), 201);
      }
      throw notFound('Wallet endpoint not found');
    }

    if (segments[0] === 'bets' || segments[0] === 'rounds') {
      if (req.method === 'POST' && segments.length === 1 && segments[0] === 'bets') {
        return success(res, await game.placeBet(user.id, requireObject(body), idempotencyKey), 201);
      }
      if (segments.length === 2 && req.method === 'GET') {
        return success(res, { round: await game.getRound(user.id, segments[1]) });
      }
      if (segments.length === 3 && segments[2] === 'settle' && req.method === 'POST' && segments[0] === 'bets') {
        return success(res, await game.settleBet(user.id, segments[1], requireObject(body), idempotencyKey));
      }
      throw notFound('Bet endpoint not found');
    }

    if (req.method === 'GET' && segments.length === 1 && segments[0] === 'history') {
      return success(res, { rounds: await game.getHistory(user.id, parseLimit(url.searchParams.get('limit'))) });
    }

    if (segments[0] === 'admin') {
      const adminUser = await currentAdmin(req);
      if (req.method === 'GET' && segments[1] === 'stats') return success(res, await admin.getStats());
      if (req.method === 'GET' && segments[1] === 'config') return success(res, await admin.getConfig());
      if (['PATCH', 'PUT'].includes(req.method) && segments[1] === 'config') {
        return success(res, await admin.updateConfig(adminUser.id, requireObject(body)));
      }
      if (req.method === 'GET' && segments[1] === 'audit') {
        return success(res, await admin.getAudit({
          limit: parseLimit(url.searchParams.get('limit')),
          type: url.searchParams.get('type') || undefined,
          userId: url.searchParams.get('userId') || undefined,
          roundId: url.searchParams.get('roundId') || undefined
        }));
      }
      throw notFound('Admin endpoint not found');
    }

    throw notFound('API endpoint not found');
  }

  const server = http.createServer(async (req, res) => {
    try {
      requestGuard.check(clientKey(req));
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else {
        await serveStatic(req, res, staticDir, url.pathname);
      }
    } catch (error) {
      if (error && error.code === 'ECONNRESET') return;
      if (!res.headersSent) {
        const result = errorBody(error);
        jsonResponse(res, result.status, result.body);
      } else {
        res.destroy();
      }
    }
  });

  return {
    server,
    store,
    services: { auth, wallet, game, admin },
    config,
    staticDir,
    dataDir
  };
}

module.exports = {
  createApplication,
  RequestGuard,
  readJsonBody,
  errorBody
};
