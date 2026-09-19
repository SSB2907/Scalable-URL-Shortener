const { validateUrl } = require("../../src/utils/urlValidator");

describe("validateUrl", () => {
  test("accepts a valid https URL", () => {
    expect(validateUrl("https://example.com/page")).toEqual({ valid: true });
  });

  test("accepts a valid http URL", () => {
    expect(validateUrl("http://example.com")).toEqual({ valid: true });
  });

  test("rejects a missing URL", () => {
    expect(validateUrl(undefined).valid).toBe(false);
    expect(validateUrl("").valid).toBe(false);
  });

  test("rejects a malformed URL", () => {
    const result = validateUrl("not a url");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not a valid URL/);
  });

  test("rejects javascript: scheme", () => {
    const result = validateUrl("javascript:alert(1)");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unsupported protocol/);
  });

  test("rejects data: scheme", () => {
    const result = validateUrl("data:text/html,<script>alert(1)</script>");
    expect(result.valid).toBe(false);
  });

  test("rejects file: scheme", () => {
    const result = validateUrl("file:///etc/passwd");
    expect(result.valid).toBe(false);
  });

  test("rejects a URL exceeding the max length", () => {
    const longUrl = "https://example.com/" + "a".repeat(3000);
    const result = validateUrl(longUrl);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceeds maximum length/);
  });

  test("accepts a URL at exactly the max length boundary", () => {
    const base = "https://example.com/";
    const padded = base + "a".repeat(2048 - base.length);
    expect(padded.length).toBe(2048);
    expect(validateUrl(padded).valid).toBe(true);
  });
});
