// src/middleware/rateLimiter.js
//
// Fixed-window rate limiter backed by Redis (INCR + EXPIRE NX), applied to
// POST /shorten to protect the public write endpoint from abuse.
//
// Tradeoff: fixed-window counters allow up to 2x the configured rate at
// window boundaries (a burst at the end of one window plus a burst at the
// start of the next). A sliding-window-log would be more precise but needs
// a sorted set and more Redis round trips per request. For a single write
// endpoint on a portfolio project, fixed-window is the right complexity
// tradeoff - documented here rather than silently accepted.
//
// Fail-open by design: if Redis is unavailable, the limiter cannot count
// requests, so it lets the request through rather than blocking all traffic
// on a cache outage (rate limiting is an abuse-prevention control, not a
// correctness guarantee - Redis stays optional per the project's design
// rule that it must never be a hard dependency).

const { safeIncrWithExpire, SENTINEL_FAILURE } = require("../cache/redisClient");
const config = require("../config");
const logger = require("../utils/logger");
const { RateLimitError } = require("../utils/errors");

function rateLimitKeyForRequest(req) {
  // req.ip respects Express's trust proxy setting when configured.
  return `ratelimit:shorten:${req.ip}`;
}

async function rateLimiter(req, res, next) {
  const key = rateLimitKeyForRequest(req);
  const count = await safeIncrWithExpire(key, config.rateLimit.windowSeconds);

  if (count === SENTINEL_FAILURE) {
    logger.warn({ path: req.path }, "Rate limiter unavailable (Redis down); failing open");
    return next();
  }

  const remaining = Math.max(config.rateLimit.maxRequests - count, 0);
  res.set("X-RateLimit-Limit", String(config.rateLimit.maxRequests));
  res.set("X-RateLimit-Remaining", String(remaining));

  if (count > config.rateLimit.maxRequests) {
    res.set("Retry-After", String(config.rateLimit.windowSeconds));
    return next(new RateLimitError(
      `Rate limit exceeded: max ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowSeconds}s`,
      config.rateLimit.windowSeconds
    ));
  }

  return next();
}

module.exports = rateLimiter;
