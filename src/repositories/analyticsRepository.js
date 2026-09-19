// src/repositories/analyticsRepository.js
//
// SQL for click_events. Written from the worker process (batch insert),
// read from the analytics controller (aggregate query).

const db = require("../db/pool");

/**
 * Batch-insert click events. `events` is an array of
 * { urlId, code, occurredAt, referrer, userAgent, ipHash }.
 * Uses a single multi-row INSERT rather than one INSERT per event, since the
 * worker processes events in batches (see src/workers/analyticsWorker.js).
 */
async function insertBatch(events) {
  if (events.length === 0) return 0;

  const values = [];
  const placeholders = events.map((e, i) => {
    const base = i * 6;
    values.push(e.urlId, e.code, e.occurredAt, e.referrer, e.userAgent, e.ipHash);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  const sql = `
    INSERT INTO click_events (url_id, code, occurred_at, referrer, user_agent, ip_hash)
    VALUES ${placeholders.join(", ")}
  `;

  await db.query(sql, values);
  return events.length;
}

async function getAggregateForCode(code) {
  const { rows } = await db.query(
    `SELECT
       count(*)::int                         AS total_clicks,
       max(occurred_at)                      AS last_clicked_at,
       min(occurred_at)                      AS first_clicked_at
     FROM click_events
     WHERE code = $1`,
    [code]
  );
  return rows[0];
}

async function getTopReferrers(code, limit = 5) {
  const { rows } = await db.query(
    `SELECT coalesce(nullif(referrer, ''), '(direct)') AS referrer, count(*)::int AS clicks
     FROM click_events
     WHERE code = $1
     GROUP BY referrer
     ORDER BY clicks DESC
     LIMIT $2`,
    [code, limit]
  );
  return rows;
}

module.exports = { insertBatch, getAggregateForCode, getTopReferrers };
