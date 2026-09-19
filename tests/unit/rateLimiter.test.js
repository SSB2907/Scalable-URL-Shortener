jest.mock("../../src/cache/redisClient", () => ({
  safeIncrWithExpire: jest.fn(),
  SENTINEL_FAILURE: Symbol("redis-unavailable"),
}));

const { safeIncrWithExpire, SENTINEL_FAILURE } = require("../../src/cache/redisClient");
const rateLimiter = require("../../src/middleware/rateLimiter");
const { RateLimitError } = require("../../src/utils/errors");

function mockReqRes() {
  const req = { ip: "1.2.3.4", path: "/shorten" };
  const res = { set: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe("rateLimiter", () => {
  beforeEach(() => jest.clearAllMocks());

  test("allows a request under the limit", async () => {
    safeIncrWithExpire.mockResolvedValue(1);
    const { req, res, next } = mockReqRes();

    await rateLimiter(req, res, next);

    expect(next).toHaveBeenCalledWith(); // called with no error
  });

  test("blocks a request over the limit with a RateLimitError (429)", async () => {
    safeIncrWithExpire.mockResolvedValue(21); // default max is 20
    const { req, res, next } = mockReqRes();

    await rateLimiter(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(RateLimitError));
    expect(res.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });

  test("resets after the window: a fresh counter value is allowed again", async () => {
    safeIncrWithExpire.mockResolvedValueOnce(20); // at the limit, still allowed
    const first = mockReqRes();
    await rateLimiter(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalledWith();

    // Simulate the window rolling over: INCR starts again from 1.
    safeIncrWithExpire.mockResolvedValueOnce(1);
    const second = mockReqRes();
    await rateLimiter(second.req, second.res, second.next);
    expect(second.next).toHaveBeenCalledWith();
  });

  test("fails open when Redis is unavailable", async () => {
    safeIncrWithExpire.mockResolvedValue(SENTINEL_FAILURE);
    const { req, res, next } = mockReqRes();

    await rateLimiter(req, res, next);

    expect(next).toHaveBeenCalledWith(); // request allowed through despite Redis being down
  });
});
