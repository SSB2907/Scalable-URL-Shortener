// src/services/idempotencyService.js
//
// Idempotency-Key support for POST /shorten.
//
// Design (see architecture audit Phase 3 discussion):
//   - Redis key `idem:<key>` holds either:
//       {"status":"processing"}                incomplete request in flight
//       {"status":"completed","response":{...},"statusCode":201}  finished
//   - Claiming the key uses SET NX with a short TTL (lockTtlSeconds). This
//     is the atomic step that resolves the race between two concurrent
//     requests carrying the same Idempotency-Key: only one SET NX can win.
//   - The loser of that race does NOT get told "conflict" forever - it is
//     told the request is already in progress (409), which is the honest
//     answer; the client can retry shortly and will then get the replayed
//     result once the winner finishes.
//   - On success, the "processing" entry is overwritten with "completed"
//     plus the response body, at a much longer TTL (resultTtlSeconds), so a
//     retried request replays the exact original result instead of creating
//     a second short URL.
//   - On failure, the claim is deleted so the key can be retried immediately
//     rather than being stuck for the full lock TTL.
//   - If Redis is unavailable, idempotency is best-effort only: we cannot
//     durably claim the key, so we skip idempotency protection entirely and
//     let the request proceed as a normal (non-deduplicated) create. This
//     matches the rule that Redis must never become a hard dependency for
//     correctness - the tradeoff is documented, not hidden.

const { redis, SENTINEL_FAILURE } = require("../cache/redisClient");
const config = require("../config");
const logger = require("../utils/logger");

const keyFor = (idempotencyKey) => `idem:${idempotencyKey}`;

const STATUS = { PROCESSING: "processing", COMPLETED: "completed" };

/**
 * @returns one of:
 *   { outcome: "claimed" }                         - proceed with the request
 *   { outcome: "replay", statusCode, body }         - return this stored response
 *   { outcome: "in_progress" }                      - another request owns this key right now
 *   { outcome: "unavailable" }                      - Redis is down; proceed without idempotency
 */
async function beginOrReplay(idempotencyKey) {
  const key = keyFor(idempotencyKey);

  let existingRaw;
  try {
    existingRaw = await redis.get(key);
  } catch (err) {
    logger.warn({ err: err.message }, "Idempotency store unavailable; proceeding without dedup");
    return { outcome: "unavailable" };
  }

  if (existingRaw) {
    const existing = JSON.parse(existingRaw);
    if (existing.status === STATUS.COMPLETED) {
      return { outcome: "replay", statusCode: existing.statusCode, body: existing.response };
    }
    return { outcome: "in_progress" };
  }

  try {
    const claimed = await redis.set(
      key,
      JSON.stringify({ status: STATUS.PROCESSING }),
      "EX",
      config.idempotency.lockTtlSeconds,
      "NX"
    );
    if (claimed === "OK") {
      return { outcome: "claimed" };
    }
    // Lost the race between our GET and this SET - the other request's
    // claim is now in place. Treat as in-progress rather than retrying
    // recursively (avoids unbounded recursion under contention).
    return { outcome: "in_progress" };
  } catch (err) {
    logger.warn({ err: err.message }, "Idempotency claim failed; proceeding without dedup");
    return { outcome: "unavailable" };
  }
}

async function complete(idempotencyKey, statusCode, responseBody) {
  try {
    await redis.set(
      keyFor(idempotencyKey),
      JSON.stringify({ status: STATUS.COMPLETED, statusCode, response: responseBody }),
      "EX",
      config.idempotency.resultTtlSeconds
    );
  } catch (err) {
    // Best-effort: if this write fails, a retried request will simply not
    // find a cached result and will (safely) create a new URL. Not ideal,
    // but never incorrect or unsafe - Postgres already has the durable row.
    logger.warn({ err: err.message }, "Failed to persist idempotency result");
  }
}

async function release(idempotencyKey) {
  try {
    await redis.del(keyFor(idempotencyKey));
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to release idempotency claim");
  }
}

module.exports = { beginOrReplay, complete, release, SENTINEL_FAILURE };
