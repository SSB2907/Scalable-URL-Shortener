// src/controllers/analyticsController.js

const analyticsService = require("../services/analyticsService");

async function getAnalytics(req, res) {
  const { code } = req.params;
  const analytics = await analyticsService.getAnalyticsForCode(code);
  return res.status(200).json(analytics);
}

module.exports = { getAnalytics };
