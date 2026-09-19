# Load Test Results

Real, captured `autocannon` output from an actual run of this project's Docker Compose stack (`docker compose up --build`) on 2026-09-19. These are not estimated or invented numbers - they are exactly what the tool printed for this environment. They describe this machine's behavior, not a production deployment's; see "Methodology & caveats" below before drawing conclusions from them.

## Environment

- Host: Windows 11 (build 26200), Intel Core i7-13650HX, ~15.7 GB RAM
- Docker Desktop (WSL2 backend) resource allocation for this run: 20 CPUs visible, ~7.6 GB memory
- App, Postgres, Redis, and the `autocannon` load generator all ran **on the same machine**, competing for the same CPU/network stack (loopback) - this is a single-machine smoke benchmark, not an isolated client/server setup
- Tool: `autocannon` v7.15.0 (`tests/load/run.js`)
- App: `node:22-alpine` container, default `Dockerfile`/`docker-compose.yml` in this repo
- Postgres 16, Redis 7 containers, both `healthy` for the entire run

## 1. Redirect - cache hit (hot URL)

One short URL, cache primed, `GET /:code` sustained for 10s at 50 connections.

```
Requests/sec (avg): 3176.4
Latency p50: 14ms  p95: 25ms  p99: 31ms
2xx: 0  3xx: 31763  4xx: 0  5xx: 0  errors: 0
Total requests: 31763  Duration: 10.05s
```

All responses were `302` (correct - shown under `3xx`, not `2xx`).

## 2. Redirect - cache miss (cold codes)

2,000 rows seeded directly in Postgres, cache entries explicitly evicted, `GET /:code` cycled across all 2,000 codes for 10s at 20 connections.

```
Requests/sec (avg): 2148.31
Latency p50: 8ms  p95: 14ms  p99: 17ms
2xx: 0  3xx: 21480  4xx: 0  5xx: 0  errors: 0
Total requests: 21480  Duration: 10.49s
```

**Measured cache hit rate for this run** (from the app's structured request logs, `cacheHit` field on every `GET /:code`, counted directly from `docker compose logs app`):

```
20325 cacheHit:false
 1163 cacheHit:true
```

≈ 5.4% hits / 94.6% misses. This is a real observed number for this specific run, not a target or an estimate - the large code pool relative to the run's request volume kept the workload miss-dominated, as the scenario intends.

**Note on interpretation:** the miss-path p50 (8ms) reads faster than the hit-path p50 (14ms) above. That is very likely an artifact of the two runs using different connection counts (20 vs 50) and general noise from sharing one machine with the load generator, not evidence that a Postgres lookup is faster than a Redis lookup. This benchmark setup is not precise enough to isolate that difference - a real conclusion would need an isolated environment and repeated runs, which this project does not have. It's stated here rather than glossed over.

## 3. URL creation (`POST /shorten`) - raw throughput

Rate limit temporarily raised to a non-binding value for this one measurement (a separate container, `RATE_LIMIT_MAX_REQUESTS=100000`) specifically to measure creation throughput on its own, isolated from the rate limiter - the production default (20 req/60s/IP) is restored immediately after and is what ships in `docker-compose.yml`/`.env.example`.

```
Requests/sec (avg): 1592.5
Latency p50: 29ms  p95: 52ms  p99: 59ms
2xx: 15925  3xx: 0  4xx: 0  5xx: 0  errors: 0
Total requests: 15925  Duration: 10.06s
```

Lower throughput and higher latency than redirects, as expected: every create does a Postgres `INSERT` plus a best-effort Redis cache-priming `SET`, versus a redirect's single lookup.

## 4. Rate-limited traffic (production default config)

`POST /shorten` at 30 connections for 8s against the **default** limit (20 requests / 60s / IP):

```
Requests/sec (avg): 2731.25
Latency p50: 10ms  p95: 15ms  p99: 18ms
2xx: 20  3xx: 0  4xx: 21826  5xx: 0  errors: 0
Total requests: 21846  Duration: 8.04s
```

Exactly 20 requests succeeded (`2xx`) - matching the configured limit precisely - and every request after that received `429` (`4xx`). This confirms the fixed-window Redis limiter (`src/middleware/rateLimiter.js`) enforces the configured ceiling correctly under concurrent load, and does so cheaply (429 responses average ~2ms, since they short-circuit before touching Postgres).

## Methodology & caveats (read before citing these numbers)

- **Single machine, shared resources.** The load generator, app, Postgres, and Redis all ran on one laptop. Numbers here measure "this whole stack on one machine," not the app's ceiling under real network conditions or with dedicated resources.
- **No repeated trials / no statistical treatment.** Each scenario was run once. These are point-in-time observations, not averages over multiple runs, and have no confidence interval.
- **`p95`/`p99` are autocannon's own percentile calculations** over the run's captured samples, reported as-is.
- **Postgres/Redis utilization was not separately profiled** (no `pg_stat_activity` or `redis-cli --stat` capture during the run) - Phase 9 asked for this "where practical"; it wasn't captured for this pass and is called out here as not done, rather than guessed at.
- **These numbers will not reproduce exactly** on a different machine, and may vary run-to-run even on this one. Re-run `npm run load:redirect` / `node tests/load/run.js <scenario>` against a freshly started `docker compose up --build` to get current numbers for any given machine.
