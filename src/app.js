// src/app.js
//
// Express app assembly. Kept free of any process.listen()/DB-connection
// side effects so it can be imported directly by tests (see
// tests/integration/*.test.js) without starting a real server or leaking
// open handles between test files.

const express = require("express");
const helmet = require("helmet");

const requestLogger = require("./middleware/requestLogger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const healthRoutes = require("./routes/healthRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const urlRoutes = require("./routes/urlRoutes");

function createApp() {
  const app = express();

  // The app sits behind a reverse proxy / load balancer in every deployed
  // topology this project documents (see docker-compose.yml, nginx.conf),
  // so req.ip must be derived from X-Forwarded-For for rate limiting and
  // analytics to see real client IPs rather than the proxy's.
  app.set("trust proxy", true);

  app.use(helmet());
  app.use(express.json());
  app.use(requestLogger);

  // Order matters: health and analytics routes are registered before the
  // url routes, because urlRoutes exposes GET /:code, which would otherwise
  // shadow every other single-segment path.
  app.use(healthRoutes);
  app.use(analyticsRoutes);
  app.use(urlRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
