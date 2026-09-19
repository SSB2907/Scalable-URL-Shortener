// Explicit factory mocks (not bare jest.mock(path) automocks): automocking
// would still `require()` the real module to derive its shape, and the real
// urlCache module transitively requires src/cache/redisClient, which
// eagerly opens a real ioredis connection at import time - exactly the kind
// of unintended real network call a unit test must never trigger.
jest.mock("../../src/repositories/urlRepository", () => ({
  insert: jest.fn(),
  findByCode: jest.fn(),
}));
jest.mock("../../src/cache/urlCache", () => ({
  getCachedUrl: jest.fn(),
  setCachedUrl: jest.fn(),
  SENTINEL_FAILURE: Symbol("redis-unavailable"),
}));
jest.mock("../../src/utils/shortCode", () => ({
  generateCode: jest.fn(),
}));

const urlRepository = require("../../src/repositories/urlRepository");
const urlCache = require("../../src/cache/urlCache");
const shortCode = require("../../src/utils/shortCode");
const { CodeCollisionError, CollisionRetriesExhaustedError, NotFoundError, ValidationError } = require("../../src/utils/errors");

const urlService = require("../../src/services/urlService");

describe("urlService.createShortUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    urlCache.setCachedUrl.mockResolvedValue(true);
  });

  test("rejects an invalid URL before touching the repository", async () => {
    await expect(urlService.createShortUrl("javascript:alert(1)")).rejects.toBeInstanceOf(ValidationError);
    expect(urlRepository.insert).not.toHaveBeenCalled();
  });

  test("creates a short URL on the first attempt when there is no collision", async () => {
    shortCode.generateCode.mockReturnValue("abc1234");
    urlRepository.insert.mockResolvedValue({
      id: 1,
      code: "abc1234",
      original_url: "https://example.com",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await urlService.createShortUrl("https://example.com");

    expect(result.code).toBe("abc1234");
    expect(urlRepository.insert).toHaveBeenCalledTimes(1);
    expect(urlCache.setCachedUrl).toHaveBeenCalledWith("abc1234", 1, "https://example.com");
  });

  test("retries with a new code on collision and succeeds on the second attempt", async () => {
    shortCode.generateCode
      .mockReturnValueOnce("collide1")
      .mockReturnValueOnce("fresh001");

    urlRepository.insert
      .mockRejectedValueOnce(new CodeCollisionError())
      .mockResolvedValueOnce({
        id: 2,
        code: "fresh001",
        original_url: "https://example.com",
        created_at: "2026-01-01T00:00:00.000Z",
      });

    const result = await urlService.createShortUrl("https://example.com");

    expect(result.code).toBe("fresh001");
    expect(urlRepository.insert).toHaveBeenCalledTimes(2);
  });

  test("gives up after maxCollisionRetries and throws CollisionRetriesExhaustedError", async () => {
    shortCode.generateCode.mockReturnValue("alwaysSame");
    urlRepository.insert.mockRejectedValue(new CodeCollisionError());

    await expect(urlService.createShortUrl("https://example.com")).rejects.toBeInstanceOf(
      CollisionRetriesExhaustedError
    );

    // config.shortCode.maxCollisionRetries defaults to 5
    expect(urlRepository.insert).toHaveBeenCalledTimes(5);
  });

  test("does not fail the create if cache priming fails", async () => {
    shortCode.generateCode.mockReturnValue("abc1234");
    urlRepository.insert.mockResolvedValue({
      id: 1,
      code: "abc1234",
      original_url: "https://example.com",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    urlCache.setCachedUrl.mockResolvedValue(false); // simulates Redis being down

    const result = await urlService.createShortUrl("https://example.com");
    expect(result.code).toBe("abc1234");
  });
});

describe("urlService.resolveCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns cached value on a cache hit without querying Postgres", async () => {
    urlCache.getCachedUrl.mockResolvedValue({ id: 1, originalUrl: "https://example.com" });

    const result = await urlService.resolveCode("abc1234");

    expect(result).toEqual({ originalUrl: "https://example.com", urlId: 1, cacheHit: true });
    expect(urlRepository.findByCode).not.toHaveBeenCalled();
  });

  test("falls back to Postgres on a confirmed cache miss and repopulates the cache", async () => {
    urlCache.getCachedUrl.mockResolvedValue(null);
    urlRepository.findByCode.mockResolvedValue({ id: 5, code: "abc1234", original_url: "https://example.com" });
    urlCache.setCachedUrl.mockResolvedValue(true);

    const result = await urlService.resolveCode("abc1234");

    expect(result).toEqual({ originalUrl: "https://example.com", cacheHit: false, urlId: 5 });
    expect(urlCache.setCachedUrl).toHaveBeenCalledWith("abc1234", 5, "https://example.com");
  });

  test("falls back to Postgres when Redis itself fails (SENTINEL_FAILURE)", async () => {
    urlCache.getCachedUrl.mockResolvedValue(urlCache.SENTINEL_FAILURE);
    urlRepository.findByCode.mockResolvedValue({ id: 9, code: "abc1234", original_url: "https://example.com" });

    const result = await urlService.resolveCode("abc1234");

    expect(result.originalUrl).toBe("https://example.com");
    expect(urlRepository.findByCode).toHaveBeenCalledWith("abc1234");
  });

  test("throws NotFoundError when the code does not exist anywhere", async () => {
    urlCache.getCachedUrl.mockResolvedValue(null);
    urlRepository.findByCode.mockResolvedValue(null);

    await expect(urlService.resolveCode("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
