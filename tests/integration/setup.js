// tests/integration/setup.js
//
// Integration tests exercise the real HTTP app against real Postgres and
// Redis (started via `docker compose up -d postgres redis`, see
// README "Testing" section) - not mocks. They are what actually verifies
// the claims in Phases 4-6 of the improvement plan (graceful Redis
// degradation, cache-aside correctness, rate limiting, idempotency) rather
// than just asserting mock call arguments.
//
// Requires: DATABASE_URL / REDIS_URL pointing at running services
// (defaults to the same values as .env.example / docker-compose.yml
// exposed on localhost) and migrations already applied (`npm run migrate`).

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://urluser:urlpass@localhost:5432/urldb";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.BASE_URL = process.env.BASE_URL || "http://localhost:3000";
// NOTE: RATE_LIMIT_MAX_REQUESTS is intentionally NOT set here. Jest gives
// each test file its own module registry, so tests/integration/rateLimit.test.js
// sets a tight limit for itself before requiring the app; every other
// integration file keeps the normal default (20/window) so their own
// multiple POST /shorten calls don't spuriously trip the limiter.
process.env.RATE_LIMIT_WINDOW_SECONDS = process.env.RATE_LIMIT_WINDOW_SECONDS || "60";

// The app deliberately sets `enableOfflineQueue: false` on the ioredis
// client (src/cache/redisClient.js) so a down Redis fails fast in
// production instead of silently queueing commands forever. The side
// effect: any command issued before the connection reaches "ready" is
// rejected outright rather than buffered. Test files call raw redis
// commands (flushdb, get, del) directly in beforeAll right after the
// module is first required, which can race the initial handshake - so
// every integration file must await this before issuing its first command.
function waitForRedisReady(redis) {
  if (redis.status === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    redis.once("ready", resolve);
    redis.once("error", reject);
  });
}

module.exports = { waitForRedisReady };
