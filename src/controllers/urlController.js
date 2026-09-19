// src/controllers/urlController.js

const urlService = require("../services/urlService");
const idempotencyService = require("../services/idempotencyService");
const { enqueueClickEvent } = require("../queue/eventQueue");
const { ValidationError, IdempotencyInProgressError } = require("../utils/errors");
const logger = require("../utils/logger");

async function shorten(req, res) {
  const { originalUrl } = req.body || {};
  const idempotencyKey = req.get("Idempotency-Key");

  if (!idempotencyKey) {
    const result = await urlService.createShortUrl(originalUrl);
    return res.status(201).json(result);
  }

  const claim = await idempotencyService.beginOrReplay(idempotencyKey);

  if (claim.outcome === "replay") {
    res.set("Idempotent-Replay", "true");
    return res.status(claim.statusCode).json(claim.body);
  }

  if (claim.outcome === "in_progress") {
    throw new IdempotencyInProgressError();
  }

  // outcome is "claimed" or "unavailable" (Redis down -> proceed without
  // dedup, per the documented tradeoff in idempotencyService.js).
  try {
    const result = await urlService.createShortUrl(originalUrl);
    if (claim.outcome === "claimed") {
      await idempotencyService.complete(idempotencyKey, 201, result);
    }
    return res.status(201).json(result);
  } catch (err) {
    if (claim.outcome === "claimed") {
      // Release the claim so a legitimate retry after a real failure isn't
      // blocked for the full lock TTL.
      await idempotencyService.release(idempotencyKey);
    }
    throw err;
  }
}

async function redirect(req, res) {
  const { code } = req.params;
  if (!code) throw new ValidationError("code is required");

  const { originalUrl, urlId, cacheHit } = await urlService.resolveCode(code);

  // Surface cacheHit to the request logger (see src/middleware/requestLogger.js).
  res.locals.cacheHit = cacheHit;

  // Analytics must never slow down or fail the redirect (Phase 5): enqueue
  // after deciding the response, without awaiting completion.
  enqueueClickEvent({
    urlId,
    code,
    referrer: req.get("Referer") || req.get("Referrer"),
    userAgent: req.get("User-Agent"),
    ip: req.ip,
  });

  return res.redirect(302, originalUrl);
}

module.exports = { shorten, redirect };
