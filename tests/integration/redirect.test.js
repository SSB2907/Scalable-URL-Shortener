const { waitForRedisReady } = require("./setup");

const request = require("supertest");
const createApp = require("../../src/app");
const db = require("../../src/db/pool");
const { redis } = require("../../src/cache/redisClient");
const urlRepository = require("../../src/repositories/urlRepository");
const { generateCode } = require("../../src/utils/shortCode");

const app = createApp();

beforeAll(async () => {
  await waitForRedisReady(redis);
  await redis.flushdb();
});

afterAll(async () => {
  await db.pool.end();
  redis.disconnect();
});

describe("GET /:code", () => {
  test("returns 404 for a code that does not exist", async () => {
    const res = await request(app).get("/does-not-exist-code");
    expect(res.status).toBe(404);
  });

  test("cache-hit path: redirects using the value primed in Redis on create", async () => {
    const create = await request(app)
      .post("/shorten")
      .send({ originalUrl: "https://example.com/cache-hit" });
    const { code } = create.body;

    // Immediately after create, the cache is primed - this redirect should
    // be served from Redis without needing Postgres.
    const res = await request(app).get(`/${code}`).redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://example.com/cache-hit");
  });

  test("cache-miss path: row exists only in Postgres, redirect still works and repopulates cache", async () => {
    const code = generateCode();
    await urlRepository.insert(code, "https://example.com/cache-miss");
    // Deliberately do NOT prime the cache - simulates a cold code.
    await redis.del(`code:${code}`);

    const before = await redis.get(`code:${code}`);
    expect(before).toBeNull();

    const res = await request(app).get(`/${code}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://example.com/cache-miss");

    // Confirm the cache-miss path repopulated Redis.
    const after = await redis.get(`code:${code}`);
    expect(after).not.toBeNull();
    expect(JSON.parse(after).originalUrl).toBe("https://example.com/cache-miss");
  });
});
