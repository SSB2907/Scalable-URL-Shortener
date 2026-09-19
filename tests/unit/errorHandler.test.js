const { errorHandler, notFoundHandler } = require("../../src/middleware/errorHandler");
const { ValidationError, RateLimitError } = require("../../src/utils/errors");

function mockRes() {
  const res = {};
  res.locals = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

describe("errorHandler", () => {
  test("maps a ValidationError to 400 with the right body shape", () => {
    const res = mockRes();
    errorHandler(new ValidationError("bad input"), { requestId: "r1" }, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { message: "bad input", code: "VALIDATION_ERROR" } });
  });

  test("maps a RateLimitError to 429 and sets Retry-After", () => {
    const res = mockRes();
    errorHandler(new RateLimitError("slow down", 60), { requestId: "r2" }, res, () => {});

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "60");
  });

  test("maps an unexpected error to a generic 500 without leaking internals", () => {
    const res = mockRes();
    errorHandler(new TypeError("something exploded"), { requestId: "r3" }, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Server error", code: "INTERNAL_ERROR" } });
  });

  test("notFoundHandler returns 404 JSON", () => {
    const res = mockRes();
    notFoundHandler({}, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
