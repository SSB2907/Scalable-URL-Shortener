// src/middleware/requestLogger.js
//
// Assigns a request/correlation id to every request and logs one structured
// line per completed request (Phase 8), replacing the previous
// console.error-only logging. Deliberately hand-rolled instead of
// pino-http, to keep full control over exactly which fields are logged
// (requestId, method, route, status, latency, cacheHit, errorType) without
// pulling in another dependency for a handful of fields.

const crypto = require("crypto");
const logger = require("../utils/logger");

function requestLogger(req, res, next) {
  const requestId = req.get("X-Request-Id") || crypto.randomUUID();
  req.requestId = requestId;
  res.set("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    logger.info({
      requestId,
      method: req.method,
      route: req.route ? req.baseUrl + req.route.path : req.path,
      status: res.statusCode,
      latencyMs: Math.round(latencyMs * 100) / 100,
      cacheHit: res.locals.cacheHit ?? null,
      errorType: res.locals.errorType ?? null,
    }, "request completed");
  });

  next();
}

module.exports = requestLogger;
