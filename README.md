---

# Scalable URL Shortener

This is a production-style URL Shortener (like Bitly) built with Node.js, PostgreSQL, and Redis.

It demonstrates scalable backend concepts:

* REST API design
* Database schema design
* Caching with Redis
* Cache-aside pattern
* HTTP 302 redirects
* Error handling
* Containerization with Docker

The project is designed to look simple but covers the core backend fundamentals expected in real-world systems.

---

## What is a URL Shortener?

A URL shortener converts a long, complex link into a short code.

Example:

```
https://doubletick.io/careers/backend/sde-1?ref=campusdrive
→ http://short.ly/Ab12xYz
```

When a user clicks the short link:

1. The service looks up the original long URL.
2. Sends back an HTTP 302 redirect.
3. The browser automatically follows it to the original link.

---

## Why is this project useful?

* **Convenience:** Short links are easier to share in social media, chats, and marketing campaigns.
* **Tracking:** Every redirect can be logged for analytics (e.g., number of clicks, user patterns).
* **Scalability Example:** Shows how Redis + Postgres can be combined for high-performance systems.
* **Interview-ready:** You can explain databases, caching, and scalability with a working demo.

---

## Features

* Create short codes for long URLs (`POST /shorten`).
* Redirect using short codes (`GET /:code`) with HTTP 302.
* Cache-aside pattern:

  * Redis as the fast, in-memory cache.
  * Postgres as the reliable source of truth.
* TTL for Redis keys to auto-expire and refresh from the database.
* Graceful degradation:

  * If Redis fails → fallback to Postgres.
  * If Postgres fails → cached entries still work.
* Dockerized setup with Postgres and Redis containers.

---

## Tech Stack

* Backend: Node.js (Express)
* Database: PostgreSQL
* Cache: Redis
* Containerization: Docker and Docker Compose
* Development tools: Nodemon, dotenv

---

## Project Structure

```
scalable-url-shortener/
 ├── server.js          # Express server & API routes
 ├── db.js              # Postgres connection helper
 ├── redis.js           # Redis client
 ├── docker-compose.yml # Postgres + Redis services
 ├── .env.example       # Example environment variables
 └── README.md
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/scalable-url-shortener.git
cd scalable-url-shortener
```

### 2. Configure environment

Copy `.env.example` into `.env`:

```env
PORT=3000
DATABASE_URL=postgres://urluser:urlpass@localhost:5432/urldb
REDIS_URL=redis://localhost:6379
BASE_URL=http://localhost:3000
```

### 3. Start services

```bash
docker compose up -d   # runs Postgres and Redis
npm install            # installs dependencies
npm run dev            # starts the server
```

### 4. Verify

Visit [http://localhost:3000](http://localhost:3000) in your browser.
Response should be:

```
URL Shortener up 
```

---

## API Usage

### Create short URL

**POST /shorten**

```bash
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"originalUrl":"https://example.com"}'
```

**Response:**

```json
{
  "code": "Ab12xYz",
  "shortUrl": "http://localhost:3000/Ab12xYz",
  "originalUrl": "https://example.com"
}
```

### Redirect to original URL

**GET /\:code**

```bash
curl -I http://localhost:3000/Ab12xYz
```

**Response headers:**

```
HTTP/1.1 302 Found
Location: https://example.com
```

### Error Handling

* Invalid URL:

```json
{ "error": "Invalid originalUrl" }
```

* Unknown code:

```text
404 Not Found
```

---

## How It Works

### When a user shortens a link

* The API validates the input URL.
* A 7-character unique code is generated using `nanoid`.
* The mapping `{code → originalUrl}` is stored in Postgres.
* Redis is pre-warmed with this mapping (set with a TTL of 1 hour).

### When a user clicks the short link

* The server first checks Redis.

  * If found → immediately returns redirect.
  * If not found → fetches from Postgres, updates Redis, then redirects.
* The response is an HTTP 302 with the original URL in the `Location` header.

### Why cache-aside pattern?

* Redis provides speed with O(1) lookups.
* Postgres provides reliability and persistence.
* If Redis fails, Postgres still works.
* If Postgres fails, cached entries in Redis can still resolve requests.

---

## Architecture Flow

```
Client → Express API → Redis (cache) → Postgres (DB)
             ↑          ↓ (cache miss → fetch from DB and repopulate)
         Short URL     Original URL
```

---

## Future Enhancements

* Add analytics (click counts per short link).
* Add expiry for short links.
* Add user accounts and authentication.
* Implement rate limiting.
* Deploy with CI/CD pipelines.

---

## Interview Pitch

"I built a scalable URL Shortener similar to Bitly using Node.js, Redis, and PostgreSQL.
It uses the cache-aside pattern: Redis stores cached results for fast lookups, while Postgres is the source of truth.
On redirect, the app first checks Redis; if not found, it falls back to Postgres and re-caches the entry.
I tested success cases, error cases, and failure scenarios (Redis down, DB down).
This project demonstrates API design, caching strategies, database indexing, scalability, and error handling — exactly what is required in backend engineering roles."

---



This version is **structured, professional, and explanatory**.  
If you read it once, you’ll be able to **confidently explain the project end-to-end** in an interview.  

👉 Do you want me to also prepare a **short “2-minute oral summary”** version (like an elevator pitch) that you can use directly when asked “Tell me about this project”?
```
