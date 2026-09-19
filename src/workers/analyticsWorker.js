// src/workers/analyticsWorker.js
//
// Background worker: drains click events pushed by the redirect handler
// (src/queue/eventQueue.js) off the Redis list and batch-inserts them into
// Postgres (click_events table). Runs as its own process (see
// package.json "worker" script and the "worker" service in
// docker-compose.yml) so a slow/failing worker can never affect API
// request latency.
//
// Loop: BRPOP blocks (with a timeout) waiting for the first event, then
// drains up to batchSize more with non-blocking RPOP so events are inserted
// in batches instead of one row per event.

const config = require("../config");
const { redis } = require("../cache/redisClient");
const analyticsRepository = require("../repositories/analyticsRepository");
const logger = require("../utils/logger");

const BRPOP_TIMEOUT_SECONDS = 5;

function parseEvent(raw) {
  try {
    const e = JSON.parse(raw);
    return {
      urlId: e.urlId,
      code: e.code,
      occurredAt: e.occurredAt,
      referrer: e.referrer,
      userAgent: e.userAgent,
      ipHash: e.ipHash,
    };
  } catch (err) {
    logger.warn({ err: err.message }, "Discarding malformed analytics event");
    return null;
  }
}

async function drainBatch(firstRaw) {
  const batch = [];
  const first = parseEvent(firstRaw);
  if (first) batch.push(first);

  while (batch.length < config.analytics.batchSize) {
    const raw = await redis.rpop(config.analytics.queueKey);
    if (!raw) break;
    const event = parseEvent(raw);
    if (event) batch.push(event);
  }

  return batch;
}

async function runOnce() {
  const result = await redis.brpop(config.analytics.queueKey, BRPOP_TIMEOUT_SECONDS);
  if (!result) return 0; // timed out waiting, nothing to do this cycle

  const [, raw] = result;
  const batch = await drainBatch(raw);
  if (batch.length === 0) return 0;

  const inserted = await analyticsRepository.insertBatch(batch);
  logger.info({ inserted }, "Analytics worker: batch inserted");
  return inserted;
}

async function start() {
  logger.info({ queue: config.analytics.queueKey }, "Analytics worker starting");
  let running = true;

  const shutdown = () => {
    logger.info("Analytics worker shutting down");
    running = false;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (running) {
    try {
      await runOnce();
    } catch (err) {
      logger.error({ err: err.message }, "Analytics worker cycle failed; backing off");
      await new Promise((r) => setTimeout(r, config.analytics.pollIntervalMs));
    }
  }
}

if (require.main === module) {
  start().catch((err) => {
    logger.error({ err }, "Analytics worker crashed");
    process.exit(1);
  });
}

module.exports = { runOnce, start };
