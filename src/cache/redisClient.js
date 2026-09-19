// src/cache/redisClient.js
//
// Redis is an optimization (cache, rate limiting, idempotency, analytics
// queue), never the source of truth. Every consumer of this module must be
// able to survive Redis being completely unavailable. To make that easy to
// get right everywhere, this module exposes "safe*" helpers that catch
// errors/timeouts internally and resolve to a sentinel instead of throwing,
// so callers don't need their own try/catch around every Redis call.

const Redis = require("ioredis");
const config = require("../config");
const logger = require("../utils/logger");

const redis = new Redis(config.redisUrl, {
  // Don't let ioredis queue commands indefinitely while disconnected -
  // fail fast so callers can fall back to Postgres instead of hanging.
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy(times) {
    // Cap backoff; keep trying to reconnect in the background regardless
    // of individual request outcomes.
    return Math.min(times * 200, 2000);
  },
  lazyConnect: false,
});

redis.on("error", (err) => {
  // ioredis emits 'error' frequently while disconnected; log at warn, not
  // error, to avoid noisy logs from a Redis outage that the app is designed
  // to tolerate.
  logger.warn({ err: err.message }, "Redis connection error");
});

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("redis command timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const SENTINEL_FAILURE = Symbol("redis-unavailable");

async function safeGet(key) {
  try {
    return await withTimeout(redis.get(key), config.cache.commandTimeoutMs);
  } catch (err) {
    logger.warn({ err: err.message, key }, "Redis GET failed; treating as cache miss");
    return SENTINEL_FAILURE;
  }
}

async function safeSet(key, value, ttlSeconds) {
  try {
    if (ttlSeconds) {
      await withTimeout(redis.set(key, value, "EX", ttlSeconds), config.cache.commandTimeoutMs);
    } else {
      await withTimeout(redis.set(key, value), config.cache.commandTimeoutMs);
    }
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, "Redis SET failed; continuing without cache write");
    return false;
  }
}

async function safeSetNX(key, value, ttlSeconds) {
  try {
    const result = await withTimeout(
      redis.set(key, value, "EX", ttlSeconds, "NX"),
      config.cache.commandTimeoutMs
    );
    return result === "OK";
  } catch (err) {
    logger.warn({ err: err.message, key }, "Redis SETNX failed");
    return SENTINEL_FAILURE;
  }
}

async function safeIncrWithExpire(key, ttlSeconds) {
  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, ttlSeconds, "NX"); // only set TTL on first increment
    const results = await withTimeout(multi.exec(), config.cache.commandTimeoutMs);
    const count = results?.[0]?.[1];
    return typeof count === "number" ? count : SENTINEL_FAILURE;
  } catch (err) {
    logger.warn({ err: err.message, key }, "Redis INCR failed");
    return SENTINEL_FAILURE;
  }
}

async function safeLPush(key, value) {
  try {
    await withTimeout(redis.lpush(key, value), config.cache.commandTimeoutMs);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, "Redis LPUSH failed; analytics event dropped");
    return false;
  }
}

async function isHealthy() {
  try {
    const pong = await withTimeout(redis.ping(), config.cache.commandTimeoutMs);
    return pong === "PONG";
  } catch {
    return false;
  }
}

module.exports = {
  redis,
  SENTINEL_FAILURE,
  safeGet,
  safeSet,
  safeSetNX,
  safeIncrWithExpire,
  safeLPush,
  isHealthy,
};
