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

describe("Health endpoints", () => {
  test("GET /health/live always returns 200 without checking dependencies", async () => {
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("GET /health/ready returns 200 and reports both dependencies up when Postgres and Redis are reachable", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.dependencies.postgres).toBe("up");
    expect(res.body.dependencies.redis).toBe("up");
  });
});
