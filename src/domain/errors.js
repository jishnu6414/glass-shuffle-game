'use strict';

class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function badRequest(code, message, details) {
  return new AppError(400, code, message, details);
}

function unauthorized(message = 'Authentication required') {
  return new AppError(401, 'AUTH_REQUIRED', message);
}

function forbidden(message = 'Forbidden') {
  return new AppError(403, 'FORBIDDEN', message);
}

function notFound(message = 'Not found') {
  return new AppError(404, 'NOT_FOUND', message);
}

function conflict(code, message, details) {
  return new AppError(409, code, message, details);
}

function tooManyRequests(message = 'Too many requests') {
  return new AppError(429, 'RATE_LIMITED', message);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests
};
