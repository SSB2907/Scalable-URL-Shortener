const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock("../../src/cache/redisClient", () => ({
  redis: mockRedis,
  SENTINEL_FAILURE: Symbol("redis-unavailable"),
}));

const idempotencyService = require("../../src/services/idempotencyService");

describe("idempotencyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("claims a fresh key (no prior entry)", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const result = await idempotencyService.beginOrReplay("key-1");

    expect(result).toEqual({ outcome: "claimed" });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "idem:key-1",
      JSON.stringify({ status: "processing" }),
      "EX",
      expect.any(Number),
      "NX"
    );
  });

  test("replays the stored response for a completed key", async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ status: "completed", statusCode: 201, response: { code: "abc1234" } })
    );

    const result = await idempotencyService.beginOrReplay("key-2");

    expect(result).toEqual({ outcome: "replay", statusCode: 201, body: { code: "abc1234" } });
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  test("reports in_progress for a key another request is still processing", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ status: "processing" }));

    const result = await idempotencyService.beginOrReplay("key-3");

    expect(result).toEqual({ outcome: "in_progress" });
  });

  test("handles two concurrent claims racing on the same key: only one wins SET NX", async () => {
    // Both requests see no existing key...
    mockRedis.get.mockResolvedValue(null);
    // ...but only the first SET NX succeeds; the second loses the race.
    mockRedis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);

    const [first, second] = await Promise.all([
      idempotencyService.beginOrReplay("key-race"),
      idempotencyService.beginOrReplay("key-race"),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["claimed", "in_progress"]);
  });

  test("degrades to 'unavailable' when Redis GET throws", async () => {
    mockRedis.get.mockRejectedValue(new Error("connection refused"));

    const result = await idempotencyService.beginOrReplay("key-4");

    expect(result).toEqual({ outcome: "unavailable" });
  });

  test("complete() stores the result so a retry can replay it", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await idempotencyService.complete("key-5", 201, { code: "xyz" });

    expect(mockRedis.set).toHaveBeenCalledWith(
      "idem:key-5",
      JSON.stringify({ status: "completed", statusCode: 201, response: { code: "xyz" } }),
      "EX",
      expect.any(Number)
    );
  });

  test("release() deletes the claim so a failed request can be retried immediately", async () => {
    await idempotencyService.release("key-6");
    expect(mockRedis.del).toHaveBeenCalledWith("idem:key-6");
  });
});
