'use strict';

const { badRequest } = require('./errors');

function assertMinorUnits(value, field = 'amountMinor') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw badRequest('INVALID_MONEY', `${field} must be a non-negative safe integer minor-unit amount`);
  }
  return value;
}

function parsePositiveMinorUnits(value, field = 'amountMinor') {
  assertMinorUnits(value, field);
  if (value < 1) throw badRequest('INVALID_MONEY', `${field} must be greater than zero`);
  return value;
}

function calculateFeeMinor(amountMinor, feeBps) {
  assertMinorUnits(amountMinor);
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error('feeBps must be an integer between 0 and 10000');
  }
  // Half-up rounding keeps every persisted value in integer minor units.
  return Math.floor((amountMinor * feeBps + 5_000) / 10_000);
}

function calculateGrossPayoutMinor(betMinor, multiplier) {
  assertMinorUnits(betMinor, 'betMinor');
  if (!Number.isSafeInteger(multiplier) || multiplier < 1) {
    throw new Error('gross payout multiplier must be a positive integer');
  }
  const payout = betMinor * multiplier;
  if (!Number.isSafeInteger(payout)) throw new Error('payout exceeds safe integer range');
  return payout;
}

function calculateNetMinor({ betMinor, feeMinor, payoutMinor, won }) {
  assertMinorUnits(betMinor, 'betMinor');
  assertMinorUnits(feeMinor, 'feeMinor');
  assertMinorUnits(payoutMinor, 'payoutMinor');
  return won ? payoutMinor - betMinor - feeMinor : -betMinor - feeMinor;
}

module.exports = {
  assertMinorUnits,
  parsePositiveMinorUnits,
  calculateFeeMinor,
  calculateGrossPayoutMinor,
  calculateNetMinor
};
