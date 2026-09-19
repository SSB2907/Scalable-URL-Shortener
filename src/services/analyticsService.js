// src/services/analyticsService.js

const urlRepository = require("../repositories/urlRepository");
const analyticsRepository = require("../repositories/analyticsRepository");
const { NotFoundError } = require("../utils/errors");

async function getAnalyticsForCode(code) {
  const url = await urlRepository.findByCode(code);
  if (!url) {
    throw new NotFoundError(`No URL found for code "${code}"`);
  }

  const [aggregate, topReferrers] = await Promise.all([
    analyticsRepository.getAggregateForCode(code),
    analyticsRepository.getTopReferrers(code),
  ]);

  return {
    code,
    originalUrl: url.original_url,
    totalClicks: aggregate.total_clicks,
    firstClickedAt: aggregate.first_clicked_at,
    lastClickedAt: aggregate.last_clicked_at,
    topReferrers,
  };
}

module.exports = { getAnalyticsForCode };
