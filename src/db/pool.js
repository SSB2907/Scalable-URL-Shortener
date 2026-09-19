// src/db/pool.js
//
// Postgres connection pool. This is the one hard dependency in the system:
// if Postgres is down, the app cannot serve correct results, so failures
// here are allowed to propagate (unlike Redis, see src/cache/redisClient.js).

const { Pool } = require("pg");
const config = require("../config");

const pool = new Pool({ connectionString: config.databaseUrl });

pool.on("error", (err) => {
  // Errors on idle clients (e.g. connection dropped by the server) must not
  // crash the process - log and let the pool recycle the connection.
  require("../utils/logger").error({ err }, "Unexpected Postgres pool error");
});

async function query(text, params) {
  return pool.query(text, params);
}

async function getClient() {
  return pool.connect();
}

async function isHealthy() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

module.exports = { pool, query, getClient, isHealthy };
