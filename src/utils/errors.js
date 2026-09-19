// src/utils/errors.js
//
// Small set of typed errors so controllers/middleware can map failures to
// the right HTTP status without string-matching messages.

class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

class CodeCollisionError extends AppError {
  constructor(message = "Unique code constraint violated") {
    super(message, 409, "CODE_COLLISION");
  }
}

class CollisionRetriesExhaustedError extends AppError {
  constructor(message = "Could not generate a unique short code, please retry") {
    super(message, 503, "COLLISION_RETRIES_EXHAUSTED");
  }
}

class RateLimitError extends AppError {
  constructor(message = "Too many requests", retryAfterSeconds) {
    super(message, 429, "RATE_LIMITED");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class IdempotencyInProgressError extends AppError {
  constructor(message = "A request with this Idempotency-Key is already in progress") {
    super(message, 409, "IDEMPOTENCY_IN_PROGRESS");
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  CodeCollisionError,
  CollisionRetriesExhaustedError,
  RateLimitError,
  IdempotencyInProgressError,
};
