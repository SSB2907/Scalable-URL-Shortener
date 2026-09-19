// src/middleware/errorHandler.js
//
// Centralized error handling (Phase 11) - controllers throw typed errors
// (src/utils/errors.js) or let unexpected errors bubble up via
// asyncHandler; this is the single place that maps them to an HTTP
// response with a consistent JSON shape.

const { AppError } = require("../utils/errors");
const logger = require("../utils/logger");

// Consistent response envelope for every error, across every endpoint.
function errorBody(err) {
  const body = { error: { message: err.message, code: err.code || "INTERNAL_ERROR" } };
  if (err.retryAfterSeconds) body.error.retryAfterSeconds = err.retryAfterSeconds;
  return body;
}

// 404 for unmatched routes.
function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: "Not found", code: "NOT_FOUND" } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;

  res.locals.errorType = err.code || err.name || "INTERNAL_ERROR";

  if (!isAppError) {
    logger.error({ err, requestId: req.requestId }, "Unhandled error");
  } else if (statusCode >= 500) {
    logger.error({ err: err.message, code: err.code, requestId: req.requestId }, "Application error");
  }

  if (err.retryAfterSeconds) {
    res.set("Retry-After", String(err.retryAfterSeconds));
  }

  res.status(statusCode).json(errorBody(isAppError ? err : { message: "Server error", code: "INTERNAL_ERROR" }));
}

module.exports = { errorHandler, notFoundHandler };
