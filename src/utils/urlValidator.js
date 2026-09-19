// src/utils/urlValidator.js
//
// Phase 2 hardening of the original `isValidUrl` from server.js. The old
// check only asked "does `new URL()` parse this?", which happily accepts
// javascript:, data:, file:, and other schemes that have no business being
// stored as a redirect target on a public shortener - that's a real
// open-redirect / scheme-injection risk (see architecture audit, Security).
//
// This validator additionally enforces:
//   - scheme must be http or https
//   - a bounded overall length (config.maxUrlLength)
//   - a non-empty hostname

const config = require("../config");

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * @param {string} rawUrl
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return { valid: false, reason: "originalUrl is required" };
  }

  if (rawUrl.length > config.maxUrlLength) {
    return { valid: false, reason: `originalUrl exceeds maximum length of ${config.maxUrlLength}` };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "originalUrl is not a valid URL" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { valid: false, reason: `Unsupported protocol "${parsed.protocol}" - only http/https are allowed` };
  }

  if (!parsed.hostname) {
    return { valid: false, reason: "originalUrl must include a hostname" };
  }

  return { valid: true };
}

module.exports = { validateUrl, ALLOWED_PROTOCOLS };
