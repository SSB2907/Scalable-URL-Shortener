require("./setup");

const request = require("supertest");
const createApp = require("../../src/app");
const db = require("../../src/db/pool");
const { redis } = require("../../src/cache/redisClient");
const { runOnce } = require("../../src/workers/analyticsWorker");

const app = createApp();

afterAll(async () => {
  await db.pool.end();
  redis.disconnect();
});

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitFor timed out");
}

describe("Click analytics (async pipeline)", () => {
  test("a redirect enqueues a click event that the worker persists, visible via GET /urls/:code/analytics", async () => {
    const create = await request(app)
      .post("/shorten")
      .send({ originalUrl: "https://example.com/analytics-target" });
    const { code } = create.body;

    const redirectRes = await request(app)
      .get(`/${code}`)
      .set("User-Agent", "jest-test-agent")
      .set("Referer", "https://referrer.example.com")
      .redirects(0);
    expect(redirectRes.status).toBe(302);

    // The event was pushed to the Redis queue asynchronously; drain it with
    // the same worker logic used in production (src/workers/analyticsWorker.js)
    // rather than running the long-lived worker process in the test.
    await waitFor(async () => {
      const inserted = await runOnce();
      return inserted > 0 || (await redis.llen("click_events_queue")) === 0;
    });

    const analyticsRes = await request(app).get(`/urls/${code}/analytics`);

    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.totalClicks).toBeGreaterThanOrEqual(1);
    expect(analyticsRes.body.topReferrers.some((r) => r.referrer === "https://referrer.example.com")).toBe(true);
  }, 10000);

  test("returns 404 for analytics on a nonexistent code", async () => {
    const res = await request(app).get("/urls/does-not-exist/analytics");
    expect(res.status).toBe(404);
  });

  test("a code with zero clicks reports totalClicks: 0", async () => {
    const create = await request(app)
      .post("/shorten")
      .send({ originalUrl: "https://example.com/never-clicked" });

    const res = await request(app).get(`/urls/${create.body.code}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.totalClicks).toBe(0);
  });
});
