-- 001_create_urls.sql
-- Core table: source of truth for short code -> original URL mappings.

CREATE TABLE IF NOT EXISTS urls (
    id            BIGSERIAL PRIMARY KEY,
    code          VARCHAR(16) NOT NULL,
    original_url  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT urls_code_unique UNIQUE (code),
    CONSTRAINT urls_original_url_length CHECK (char_length(original_url) <= 2048)
);

-- Lookups during redirect are always by code; the UNIQUE constraint above
-- already creates a btree index on `code`, so no extra index is needed there.
-- created_at is indexed for potential future "recent links" / cleanup queries.
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls (created_at);
