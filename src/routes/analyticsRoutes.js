// src/routes/analyticsRoutes.js

const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const analyticsController = require("../controllers/analyticsController");

const router = express.Router();

router.get("/urls/:code/analytics", asyncHandler(analyticsController.getAnalytics));

module.exports = router;
