const { waitForRedisReady } = require("./setup");

const request = require("supertest");
const createApp = require("../../src/app");
const db = require("../../src/db/pool");
const { redis } = require("../../src/cache/redisClient");

const app = createApp();

beforeAll(async () => {
  await waitForRedisReady(redis);
  await redis.flushdb();
});

afterAll(async () => {
  await db.pool.end();
  redis.disconnect();
});

describe("Idempotency-Key on POST /shorten", () => {
  test("retrying the same Idempotency-Key returns the original result, not a new code", async () => {
    const key = `test-key-${Date.now()}`;

    const first = await request(app)
      .post("/shorten")
      .set("Idempotency-Key", key)
      .send({ originalUrl: "https://example.com/idempotent" });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/shorten")
      .set("Idempotency-Key", key)
      .send({ originalUrl: "https://example.com/idempotent" });

    expect(second.status).toBe(201);
    expect(second.body.code).toBe(first.body.code);
    expect(second.headers["idempotent-replay"]).toBe("true");
  });

  test("two concurrent requests with the same key: one proceeds, the other sees 409 in_progress or the replay", async () => {
    const key = `concurrent-key-${Date.now()}`;

    const [a, b] = await Promise.all([
      request(app).post("/shorten").set("Idempotency-Key", key).send({ originalUrl: "https://example.com/race" }),
      request(app).post("/shorten").set("Idempotency-Key", key).send({ originalUrl: "https://example.com/race" }),
    ]);

    const statuses = [a.status, b.status].sort();
    // Either both succeeded with the same code (if the second request's
    // in-flight check landed after the first had already completed), or
    // one succeeded (201) and the other was told a request is already in
    // progress (409) - both are correct outcomes of the race, but they must
    // never both independently create a *different* code.
    const successBodies = [a, b].filter((r) => r.status === 201).map((r) => r.body.code);
    expect(new Set(successBodies).size).toBe(1);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
  });

  test("different Idempotency-Keys for the same URL create two independent short codes", async () => {
    const urlBody = { originalUrl: "https://example.com/independent" };
    const a = await request(app).post("/shorten").set("Idempotency-Key", `k1-${Date.now()}`).send(urlBody);
    const b = await request(app).post("/shorten").set("Idempotency-Key", `k2-${Date.now()}`).send(urlBody);

    expect(a.body.code).not.toBe(b.body.code);
  });

  test("no Idempotency-Key header: behaves like a normal (non-deduplicated) create", async () => {
    const a = await request(app).post("/shorten").send({ originalUrl: "https://example.com/no-key" });
    const b = await request(app).post("/shorten").send({ originalUrl: "https://example.com/no-key" });

    expect(a.body.code).not.toBe(b.body.code);
  });
});
