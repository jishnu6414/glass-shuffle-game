'use strict';

const crypto = require('node:crypto');

const ROLL_SPACE = 1_000_000;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacSha256(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function uniformFromDigest(digest, offset, maxExclusive) {
  if (!Buffer.isBuffer(digest)) throw new TypeError('digest must be a Buffer');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > digest.length) {
    throw new RangeError('digest offset is out of range');
  }
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new RangeError('maxExclusive is out of range');
  }

  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  let cursor = offset;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (cursor + 4 > digest.length) {
      digest = crypto.createHash('sha256').update(digest).digest();
      cursor = 0;
    }
    const value = digest.readUInt32BE(cursor);
    cursor += 4;
    if (value < limit) return value % maxExclusive;
  }

  // Rejection is astronomically unlikely for the supported ranges. A fresh
  // cryptographic digest keeps the fallback unbiased if it ever occurs.
  const fallback = crypto.randomInt(0, maxExclusive);
  return fallback;
}

function deriveRoundRandomness({ roundId, serverSeed, targetWinProbabilityBps, selectedGlass = null }) {
  if (!roundId || !serverSeed) throw new Error('roundId and serverSeed are required');
  if (!Number.isSafeInteger(targetWinProbabilityBps) || targetWinProbabilityBps < 0 || targetWinProbabilityBps > 10_000) {
    throw new Error('targetWinProbabilityBps must be between 0 and 10000');
  }

  const targetDigest = hmacSha256(serverSeed, `${roundId}:target`);
  const targetRoll = uniformFromDigest(targetDigest, 0, ROLL_SPACE);
  const targetWin = targetRoll < targetWinProbabilityBps * 100;
  const glassDigest = hmacSha256(serverSeed, `${roundId}:glass`);
  let winningGlass;

  if (selectedGlass === null || selectedGlass === undefined) {
    winningGlass = uniformFromDigest(glassDigest, 0, 3);
  } else if (targetWin) {
    // The configured target controls the win rate. On a target win, the
    // player's chosen glass is the audited winning glass.
    winningGlass = selectedGlass;
  } else {
    const losingGlasses = [0, 1, 2].filter((glass) => glass !== selectedGlass);
    winningGlass = losingGlasses[uniformFromDigest(glassDigest, 0, losingGlasses.length)];
  }

  return {
    targetRoll,
    targetWin,
    winningGlass,
    outcomeDigest: crypto.createHash('sha256').update(Buffer.concat([targetDigest, glassDigest])).digest('hex')
  };
}

function createRoundRandomness({ roundId, targetWinProbabilityBps, randomBytes = crypto.randomBytes }) {
  const serverSeed = randomBytes(32).toString('hex');
  const serverSeedHash = sha256(serverSeed);
  const derived = deriveRoundRandomness({ roundId, serverSeed, targetWinProbabilityBps });
  return {
    serverSeed,
    serverSeedHash,
    ...derived
  };
}

function sampleTargetWin(targetWinProbabilityBps, randomInt = crypto.randomInt) {
  if (!Number.isSafeInteger(targetWinProbabilityBps) || targetWinProbabilityBps < 0 || targetWinProbabilityBps > 10_000) {
    throw new Error('targetWinProbabilityBps must be between 0 and 10000');
  }
  return randomInt(0, 10_000) < targetWinProbabilityBps;
}

module.exports = {
  ROLL_SPACE,
  sha256,
  hmacSha256,
  uniformFromDigest,
  deriveRoundRandomness,
  createRoundRandomness,
  sampleTargetWin
};
