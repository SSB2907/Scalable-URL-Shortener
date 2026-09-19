// Set a tight limit *before* requiring setup/config, so this test file (and
// only this one - Jest gives each test file its own module registry) can
// observe a 429 without firing dozens of requests.
process.env.RATE_LIMIT_MAX_REQUESTS = "5";

require("./setup");

const request = require("supertest");
const createApp = require("../../src/app");
const db = require("../../src/db/pool");
const { redis } = require("../../src/cache/redisClient");

const app = createApp();

afterAll(async () => {
  await db.pool.end();
  redis.disconnect();
});

// setup.js sets RATE_LIMIT_MAX_REQUESTS=5 for a fast, deterministic test.
const LIMIT = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10);

describe("Rate limiting on POST /shorten", () => {
  test(`allows the first ${LIMIT} requests, then returns 429`, async () => {
    // Use a dedicated IP-like key so this test doesn't collide with counts
    // left over from other tests hitting the same limiter key.
    const agent = request.agent(app);

    const statuses = [];
    for (let i = 0; i < LIMIT + 2; i++) {
      const res = await agent.post("/shorten").send({ originalUrl: `https://example.com/rl-${i}` });
      statuses.push(res.status);
    }

    const successCount = statuses.filter((s) => s === 201).length;
    const limitedCount = statuses.filter((s) => s === 429).length;

    expect(successCount).toBeLessThanOrEqual(LIMIT);
    expect(limitedCount).toBeGreaterThan(0);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  test("429 response includes Retry-After and a structured error body", async () => {
    let last;
    for (let i = 0; i < LIMIT + 1; i++) {
      last = await request(app).post("/shorten").send({ originalUrl: `https://example.com/rl2-${i}` });
    }

    expect(last.status).toBe(429);
    expect(last.headers["retry-after"]).toBeDefined();
    expect(last.body.error.code).toBe("RATE_LIMITED");
  });
});
