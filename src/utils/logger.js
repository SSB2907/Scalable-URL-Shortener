// src/utils/logger.js
//
// Structured JSON logging (pino) instead of console.log/console.error.
// Replaces the previous ad-hoc console.error calls throughout the app.

const pino = require("pino");
const config = require("../config");

const logger = pino({
  level: config.logLevel,
  base: { service: "url-shortener" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
