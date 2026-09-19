// src/services/urlService.js
//
// Business logic for creating and resolving short URLs. Controllers stay
// thin (HTTP concerns only); this is where the actual rules live.

const config = require("../config");
const urlRepository = require("../repositories/urlRepository");
const { getCachedUrl, setCachedUrl, SENTINEL_FAILURE } = require("../cache/urlCache");
const { generateCode } = require("../utils/shortCode");
const { validateUrl } = require("../utils/urlValidator");
const logger = require("../utils/logger");
const {
  ValidationError,
  CodeCollisionError,
  CollisionRetriesExhaustedError,
  NotFoundError,
} = require("../utils/errors");

function buildShortUrl(code) {
  return `${config.baseUrl}/${code}`;
}

/**
 * Create a short URL for `originalUrl`.
 *
 * Collision handling: nanoid(7) collisions are astronomically unlikely
 * (~7e12 possible codes), but "unlikely" is not "impossible", and the
 * original implementation pushed the retry onto the client (a bare 409).
 * Here the server transparently regenerates the code and retries the
 * insert up to config.shortCode.maxCollisionRetries times before giving up
 * with a 503 - the caller never needs to invent its own retry loop for a
 * problem the server can solve itself.
 */
async function createShortUrl(originalUrl) {
  const validation = validateUrl(originalUrl);
  if (!validation.valid) {
    throw new ValidationError(validation.reason);
  }

  let lastErr;
  for (let attempt = 1; attempt <= config.shortCode.maxCollisionRetries; attempt++) {
    const code = generateCode();
    try {
      const row = await urlRepository.insert(code, originalUrl);

      if (attempt > 1) {
        logger.warn({ attempt, code }, "Short code collision resolved via retry");
      }

      // Cache priming is an optimization, not a correctness requirement:
      // if it fails, the row is already durably committed in Postgres, so
      // we log and continue rather than failing a successful creation.
      const cached = await setCachedUrl(code, row.id, row.original_url);
      if (!cached) {
        logger.warn({ code }, "Failed to prime cache after create; will populate on first read");
      }

      return {
        code: row.code,
        originalUrl: row.original_url,
        shortUrl: buildShortUrl(row.code),
        createdAt: row.created_at,
      };
    } catch (err) {
      if (err instanceof CodeCollisionError) {
        lastErr = err;
        continue; // try again with a freshly generated code
      }
      throw err;
    }
  }

  throw new CollisionRetriesExhaustedError(
    `Failed to generate a unique short code after ${config.shortCode.maxCollisionRetries} attempts`
  );
  // (lastErr is intentionally not rethrown - it's a routine collision, not
  // the actual failure reason we want surfaced to the client.)
}

/**
 * Resolve a short code to its original URL for the redirect path.
 * Cache-aside: Redis first, Postgres on miss or on Redis failure.
 */
async function resolveCode(code) {
  const cached = await getCachedUrl(code);

  if (cached !== null && cached !== SENTINEL_FAILURE) {
    return { originalUrl: cached.originalUrl, urlId: cached.id, cacheHit: true };
  }

  // cached is either a confirmed miss (null) or a Redis failure
  // (SENTINEL_FAILURE) - both fall back to Postgres identically. This is
  // the core "Redis must not be a hard dependency" behavior: a down Redis
  // degrades redirects to Postgres-only rather than failing them.
  const row = await urlRepository.findByCode(code);
  if (!row) {
    throw new NotFoundError(`No URL found for code "${code}"`);
  }

  // Best-effort repopulate; ignore failures for the same reason as above.
  await setCachedUrl(code, row.id, row.original_url);

  return { originalUrl: row.original_url, cacheHit: false, urlId: row.id };
}

module.exports = { createShortUrl, resolveCode, buildShortUrl };
