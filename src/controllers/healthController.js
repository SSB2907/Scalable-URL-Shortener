// src/controllers/healthController.js
//
// Liveness vs readiness, kept deliberately distinct (Phase 8):
//   - /health/live  -> "is the process up and able to handle a request at
//                       all". Never checks dependencies - a slow/degraded
//                       Postgres should not cause an orchestrator to kill
//                       and restart otherwise-healthy app instances.
//   - /health/ready -> "should traffic be routed to this instance right
//                       now". Postgres is checked and REQUIRED (it's the
//                       source of truth - see architecture audit); Redis is
//                       checked and reported, but its failure does NOT flip
//                       readiness to false, because the app is designed to
//                       run correctly without it (cache-aside with
//                       Postgres fallback throughout).

const db = require("../db/pool");
const redisClient = require("../cache/redisClient");

function live(req, res) {
  res.status(200).json({ status: "ok" });
}

async function ready(req, res) {
  const [dbHealthy, redisHealthy] = await Promise.all([
    db.isHealthy(),
    redisClient.isHealthy(),
  ]);

  const dependencies = {
    postgres: dbHealthy ? "up" : "down",
    redis: redisHealthy ? "up" : "down",
  };

  // Postgres is required for readiness. Redis is optional: report its
  // status, but a Redis outage alone must not remove this instance from
  // the load balancer, since redirects still work (Postgres fallback).
  const ready = dbHealthy;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    dependencies,
  });
}

module.exports = { live, ready };
