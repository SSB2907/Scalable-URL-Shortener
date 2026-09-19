// src/repositories/urlRepository.js
//
// All direct SQL for the `urls` table lives here. Postgres is the source of
// truth (see architecture audit) - nothing in services/controllers should
// import `pg` or write raw SQL directly.

const db = require("../db/pool");
const { CodeCollisionError } = require("../utils/errors");

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Insert a new short URL row. Throws CodeCollisionError if `code` already
 * exists (caller is expected to retry with a new code - see
 * src/services/urlService.js).
 */
async function insert(code, originalUrl) {
  try {
    const { rows } = await db.query(
      `INSERT INTO urls (code, original_url)
       VALUES ($1, $2)
       RETURNING id, code, original_url, created_at`,
      [code, originalUrl]
    );
    return rows[0];
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      throw new CodeCollisionError(`Short code "${code}" already exists`);
    }
    throw err;
  }
}

async function findByCode(code) {
  const { rows } = await db.query(
    "SELECT id, code, original_url, created_at FROM urls WHERE code = $1",
    [code]
  );
  return rows[0] || null;
}

module.exports = { insert, findByCode };
