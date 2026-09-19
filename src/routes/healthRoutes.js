// src/routes/healthRoutes.js

const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const healthController = require("../controllers/healthController");

const router = express.Router();

router.get("/health/live", healthController.live);
router.get("/health/ready", asyncHandler(healthController.ready));

module.exports = router;
