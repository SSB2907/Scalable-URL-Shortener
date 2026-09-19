// src/server.js
//
// Process entrypoint: starts the HTTP server. Separated from src/app.js so
// app construction (used by tests) never has a side effect of binding a
// port or touching real DB/Redis connections at import time.

const createApp = require("./app");
const config = require("./config");
const logger = require("./utils/logger");

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, "URL shortener listening");
});

function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  server.close(() => process.exit(0));
  // Force-exit if graceful close hangs (e.g. long-lived keep-alive sockets).
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = server;
