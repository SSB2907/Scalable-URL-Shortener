// src/queue/eventQueue.js
//
// Minimal event queue for click analytics, built on a Redis list
// (LPUSH / BRPOP). This is intentionally not Kafka/RabbitMQ/SQS - see the
// README "Engineering Tradeoffs" section for why: a single list is enough
// to decouple the redirect request from the write to Postgres, which is
// the only actual requirement here (Phase 5). Reaching for a dedicated
// broker would add operational complexity with no corresponding benefit at
// this project's scale.
//
// Delivery semantics: at-most-once. If the worker crashes between BRPOP and
// the Postgres insert, that one event is lost. Click analytics is not a
// billing or audit system, so this tradeoff is acceptable and is stated
// explicitly rather than glossed over.

const crypto = require("crypto");
const config = require("../config");
const { safeLPush } = require("../cache/redisClient");
const logger = require("../utils/logger");

function hashIp(ip) {
  if (!ip) return null;
  // Store a one-way hash, never the raw IP - enough to de-duplicate/rate
  // analyze without retaining personal data.
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * Fire-and-forget: enqueue a click event without making the caller (the
 * redirect handler) wait on it. Must never throw and must never delay the
 * 302 response - analytics is explicitly non-latency-sensitive (Phase 5).
 */
function enqueueClickEvent({ urlId, code, referrer, userAgent, ip }) {
  const event = {
    urlId,
    code,
    occurredAt: new Date().toISOString(),
    referrer: referrer || null,
    userAgent: userAgent || null,
    ipHash: hashIp(ip),
  };

  // Intentionally not awaited by callers; this function itself awaits
  // internally only to log failures, never to block the caller's response.
  safeLPush(config.analytics.queueKey, JSON.stringify(event)).catch((err) => {
    logger.warn({ err: err.message, code }, "Failed to enqueue click event");
  });
}

module.exports = { enqueueClickEvent, hashIp };
