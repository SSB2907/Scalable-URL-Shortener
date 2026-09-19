// src/cache/urlCache.js
//
// Cache-aside helpers specific to the code -> original_url mapping. Built on
// top of the "safe*" primitives in redisClient.js, so a Redis outage here
// degrades to "treat as cache miss" rather than throwing.

const { safeGet, safeSet, SENTINEL_FAILURE } = require("./redisClient");
const config = require("../config");

const keyFor = (code) => `code:${code}`;

// Cache value is JSON `{ id, originalUrl }` rather than a bare URL string,
// so a cache hit on the redirect path still has the url_id needed to record
// a click event (see src/services/urlService.js, src/queue/eventQueue.js) -
// without this, every redirect would need a Postgres lookup just to get the
// id, defeating the point of caching.

/**
 * @returns {{id: number, originalUrl: string}|null|typeof SENTINEL_FAILURE}
 *   object -> cache hit
 *   null   -> confirmed cache miss (Redis responded, key absent)
 *   SENTINEL_FAILURE -> Redis itself failed/timed out; caller must treat
 *                        this the same as a miss and fall back to Postgres.
 */
async function getCachedUrl(code) {
  const raw = await safeGet(keyFor(code));
  if (raw === SENTINEL_FAILURE || raw === null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrupt/legacy cache entry - treat as a miss
  }
}

async function setCachedUrl(code, id, originalUrl) {
  return safeSet(keyFor(code), JSON.stringify({ id, originalUrl }), config.cache.ttlSeconds);
}

module.exports = { getCachedUrl, setCachedUrl, SENTINEL_FAILURE };
