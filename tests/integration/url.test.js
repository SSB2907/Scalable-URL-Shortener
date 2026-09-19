const { waitForRedisReady } = require("./setup");

const request = require("supertest");
const createApp = require("../../src/app");
const db = require("../../src/db/pool");
const { redis } = require("../../src/cache/redisClient");

const app = createApp();

beforeAll(async () => {
  await waitForRedisReady(redis);
  // Isolate from other integration test files sharing the same Redis
  // instance: without this, rate-limit counters (and idempotency claims)
  // left over from another file's POST /shorten calls would make otherwise
  // valid requests here fail with 429. Safe on a dedicated test Redis DB.
  await redis.flushdb();
});

afterAll(async () => {
  await db.pool.end();
  redis.disconnect();
});

describe("POST /shorten", () => {
  test("creates a short URL for a valid https URL", async () => {
    const res = await request(app)
      .post("/shorten")
      .send({ originalUrl: "https://example.com/creates-a-short-url" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      originalUrl: "https://example.com/creates-a-short-url",
    });
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{7}$/);
    expect(res.body.shortUrl).toContain(res.body.code);
  });

  test("rejects a missing originalUrl with 400", async () => {
    const res = await request(app).post("/shorten").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("rejects a malformed URL with 400", async () => {
    const res = await request(app).post("/shorten").send({ originalUrl: "not a url" });
    expect(res.status).toBe(400);
  });

  test("rejects an unsupported protocol (javascript:) with 400", async () => {
    const res = await request(app).post("/shorten").send({ originalUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/protocol/i);
  });

  test("rejects a URL over the maximum length with 400", async () => {
    const longUrl = "https://example.com/" + "a".repeat(3000);
    const res = await request(app).post("/shorten").send({ originalUrl: longUrl });
    expect(res.status).toBe(400);
  });

  test("two different requests for the same originalUrl get two different codes (no implicit dedup)", async () => {
    const first = await request(app).post("/shorten").send({ originalUrl: "https://example.com/dup" });
    const second = await request(app).post("/shorten").send({ originalUrl: "https://example.com/dup" });

    expect(first.body.code).not.toBe(second.body.code);
  });
});
