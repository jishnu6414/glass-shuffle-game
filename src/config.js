'use strict';

const DEFAULT_CONFIG = Object.freeze({
  targetWinProbabilityBps: 4_500,
  feeBps: 500,
  minBetMinor: 1_000,
  maxBetMinor: 100_000,
  grossPayoutMultiplier: 2,
  initialBalanceMinor: 100_000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  maxBodyBytes: 1_048_576,
  rateLimitPerMinute: 120,
  maxHistoryItems: 100,
  currency: 'USD',
  mode: 'sandbox'
});

function integerEnv(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function loadConfig(env = process.env, overrides = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    targetWinProbabilityBps: integerEnv(env, 'GS_TARGET_WIN_BPS', DEFAULT_CONFIG.targetWinProbabilityBps, { max: 10_000 }),
    feeBps: integerEnv(env, 'GS_FEE_BPS', DEFAULT_CONFIG.feeBps, { max: 10_000 }),
    minBetMinor: integerEnv(env, 'GS_MIN_BET_MINOR', DEFAULT_CONFIG.minBetMinor, { min: 1 }),
    maxBetMinor: integerEnv(env, 'GS_MAX_BET_MINOR', DEFAULT_CONFIG.maxBetMinor, { min: 1 }),
    grossPayoutMultiplier: integerEnv(env, 'GS_GROSS_PAYOUT_MULTIPLIER', DEFAULT_CONFIG.grossPayoutMultiplier, { min: 1, max: 100 }),
    initialBalanceMinor: integerEnv(env, 'GS_INITIAL_BALANCE_MINOR', DEFAULT_CONFIG.initialBalanceMinor, { min: 0 }),
    sessionTtlMs: integerEnv(env, 'GS_SESSION_TTL_MS', DEFAULT_CONFIG.sessionTtlMs, { min: 60_000 }),
    maxBodyBytes: integerEnv(env, 'GS_MAX_BODY_BYTES', DEFAULT_CONFIG.maxBodyBytes, { min: 1_024 }),
    rateLimitPerMinute: integerEnv(env, 'GS_RATE_LIMIT_PER_MINUTE', DEFAULT_CONFIG.rateLimitPerMinute, { min: 1 }),
    maxHistoryItems: integerEnv(env, 'GS_MAX_HISTORY_ITEMS', DEFAULT_CONFIG.maxHistoryItems, { min: 1, max: 500 }),
    currency: typeof env.GS_CURRENCY === 'string' && env.GS_CURRENCY.trim() ? env.GS_CURRENCY.trim().toUpperCase() : DEFAULT_CONFIG.currency,
    mode: 'sandbox',
    ...overrides
  };

  validateConfig(config);
  return config;
}

function validateConfig(config) {
  const integerFields = [
    'targetWinProbabilityBps',
    'feeBps',
    'minBetMinor',
    'maxBetMinor',
    'grossPayoutMultiplier',
    'initialBalanceMinor',
    'sessionTtlMs',
    'maxBodyBytes',
    'rateLimitPerMinute',
    'maxHistoryItems'
  ];

  for (const field of integerFields) {
    if (!Number.isSafeInteger(config[field]) || config[field] < 0) {
      throw new Error(`Invalid config value for ${field}`);
    }
  }

  if (config.targetWinProbabilityBps > 10_000) throw new Error('targetWinProbabilityBps must be <= 10000');
  if (config.feeBps > 10_000) throw new Error('feeBps must be <= 10000');
  if (config.minBetMinor < 1) throw new Error('minBetMinor must be positive');
  if (config.maxBetMinor < config.minBetMinor) throw new Error('maxBetMinor must be >= minBetMinor');
  if (config.grossPayoutMultiplier < 1) throw new Error('grossPayoutMultiplier must be positive');
  if (config.mode !== 'sandbox') throw new Error('Only sandbox mode is supported');
  return config;
}

function publicGameConfig(config) {
  return {
    targetWinProbabilityBps: config.targetWinProbabilityBps,
    feeBps: config.feeBps,
    minBetMinor: config.minBetMinor,
    maxBetMinor: config.maxBetMinor,
    grossPayoutMultiplier: config.grossPayoutMultiplier,
    currency: config.currency,
    mode: config.mode
  };
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  validateConfig,
  publicGameConfig
};
