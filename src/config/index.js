// src/config/index.js
//
// Single place that reads process.env. Nothing else in the app should call
// process.env directly - that keeps configuration centralized and makes it
// obvious, in one file, what the app actually depends on.

require("dotenv").config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  baseUrl: required("BASE_URL", "http://localhost:3000"),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),

  logLevel: process.env.LOG_LEVEL || "info",

  shortCode: {
    length: parseInt(process.env.SHORT_CODE_LENGTH || "7", 10),
    maxCollisionRetries: parseInt(process.env.SHORT_CODE_MAX_RETRIES || "5", 10),
  },

  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "3600", 10),
    // Fail fast on a slow/unreachable Redis rather than let a request hang -
    // Redis is an optimization, so a stuck connection must never be allowed
    // to block a response longer than this.
    commandTimeoutMs: parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || "150", 10),
  },

  rateLimit: {
    windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || "60", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "20", 10),
  },

  idempotency: {
    // Short TTL for an in-flight claim: protects against two concurrent
    // requests with the same key, without leaving a stale lock forever if
    // the process crashes mid-request.
    lockTtlSeconds: parseInt(process.env.IDEMPOTENCY_LOCK_TTL_SECONDS || "60", 10),
    // Long TTL for the stored result: how long a retried request with the
    // same Idempotency-Key will replay the original response.
    resultTtlSeconds: parseInt(process.env.IDEMPOTENCY_RESULT_TTL_SECONDS || "86400", 10),
  },

  maxUrlLength: parseInt(process.env.MAX_URL_LENGTH || "2048", 10),

  analytics: {
    queueKey: process.env.ANALYTICS_QUEUE_KEY || "click_events_queue",
    batchSize: parseInt(process.env.ANALYTICS_WORKER_BATCH_SIZE || "50", 10),
    pollIntervalMs: parseInt(process.env.ANALYTICS_WORKER_POLL_INTERVAL_MS || "1000", 10),
  },
};

module.exports = config;
