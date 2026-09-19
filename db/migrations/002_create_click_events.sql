-- 002_create_click_events.sql
-- Append-only table for redirect click analytics. Populated asynchronously
-- by the analytics worker (see src/workers/analyticsWorker.js), never on
-- the synchronous redirect request path.

CREATE TABLE IF NOT EXISTS click_events (
    id           BIGSERIAL PRIMARY KEY,
    url_id       BIGINT NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    code         VARCHAR(16) NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    referrer     TEXT,
    user_agent   TEXT,
    ip_hash      CHAR(64) -- SHA-256 hex digest of the client IP; never the raw IP.
);

-- Analytics reads are always "give me all clicks for this code", so this
-- is the one index that matters for GET /urls/:code/analytics.
CREATE INDEX IF NOT EXISTS idx_click_events_code ON click_events (code);
CREATE INDEX IF NOT EXISTS idx_click_events_occurred_at ON click_events (occurred_at);
