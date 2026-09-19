// server.js
require("dotenv").config();               // Load .env first
const express = require("express");       // Minimal web framework
const { nanoid } = require("nanoid");     // Short unique ID generator
const db = require("./db");               // Our Postgres helper
const redis = require("./redis");         // Our Redis client

const app = express();                    // Create Express app
app.use(express.json());                  // Parse JSON bodies

// --- small helper to validate URL format ---
function isValidUrl(url) {
  try { new URL(url); return true; }      // Will throw if invalid URL
  catch { return false; }
}

// POST /shorten -> create short code for a long URL
app.post("/shorten", async (req, res) => {
  try {
    const { originalUrl } = req.body || {};               // Extract from body
    if (!originalUrl || !isValidUrl(originalUrl)) {        // Validate input
      return res.status(400).json({ error: "Invalid originalUrl" });
    }

    const code = nanoid(7);                                // Generate 7-char code

    // Insert mapping into Postgres (source of truth)
    const insert = `INSERT INTO urls(code, original_url) VALUES($1,$2) RETURNING code`;
    await db.query(insert, [code, originalUrl]);

    // Prime Redis cache so first redirect is fast (optional, but nice)
    await redis.set(`code:${code}`, originalUrl, "EX", 60 * 60); // TTL 1 hour

    return res.json({
      code,
      shortUrl: `${process.env.BASE_URL}/${code}`,         // e.g., http://localhost:3000/Ab12xYz
      originalUrl,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {                            // Unique violation (rare)
      return res.status(409).json({ error: "Code collision, retry." });
    }
    return res.status(500).json({ error: "Server error" }); // Generic safety net
  }
});

// GET /:code -> redirect to original URL
app.get("/:code", async (req, res) => {
  const { code } = req.params;                             // Grab short code from path
  if (!code) return res.status(400).send("Bad Request");

  try {
    // 1) Check Redis cache first (fast path)
    const cached = await redis.get(`code:${code}`);
    if (cached) {
      return res.redirect(cached);                         // Immediate redirect
    }

    // 2) Fallback to Postgres (source of truth)
    const { rows } = await db.query(
      "SELECT original_url FROM urls WHERE code=$1",
      [code]
    );
    if (!rows.length) return res.status(404).send("Not found");

    const originalUrl = rows[0].original_url;

    // 3) Repopulate cache so next hit is fast
    await redis.set(`code:${code}`, originalUrl, "EX", 60 * 60);

    return res.redirect(originalUrl);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

// Health check (handy for quick tests)
app.get("/", (_, res) => {
  res.send("URL Shortener up ✅");
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running → http://localhost:${port}`));
