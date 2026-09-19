// src/routes/urlRoutes.js

const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const rateLimiter = require("../middleware/rateLimiter");
const urlController = require("../controllers/urlController");

const router = express.Router();

router.post("/shorten", rateLimiter, asyncHandler(urlController.shorten));

// Placed last / matched narrowly by the app-level route ordering in app.js
// so it never shadows other top-level routes (/health, /urls/...).
router.get("/:code", asyncHandler(urlController.redirect));

module.exports = router;
