// tests/load/run.js
//
// Reproducible load-test harness for Phase 9 (see README "Load Testing").
// Uses autocannon against the app as it actually runs (docker compose up),
// not the test suite / mocks - these are the closest numbers this project
// can produce to "how does this behave under load", run on this machine.
// Results are NOT invented: this script prints exactly what autocannon
// measured; see LOAD_TEST_RESULTS.md for the captured output of an actual
// run and its environment (hardware, Docker Desktop, single machine).
//
// Usage:
//   node tests/load/run.js redirect-hit
//   node tests/load/run.js redirect-miss
//   node tests/load/run.js shorten
//   node tests/load/run.js rate-limited

const autocannon = require("autocannon");
const http = require("http");

const BASE_URL = process.env.LOAD_TEST_BASE_URL || "http://localhost:3000";
const DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || "15", 10);
const CONNECTIONS = parseInt(process.env.LOAD_TEST_CONNECTIONS || "50", 10);

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      BASE_URL + path,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Failed to parse response for ${path}: ${raw}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function createUrls(count, labelPrefix) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const result = await postJson("/shorten", { originalUrl: `https://example.com/${labelPrefix}-${i}` });
    if (!result.code) throw new Error(`Unexpected /shorten response: ${JSON.stringify(result)}`);
    codes.push(result.code);
  }
  return codes;
}

function printResult(result) {
  console.log("\n=== autocannon result ===");
  console.log(`Requests/sec (avg): ${result.requests.average}`);
  console.log(`Latency p50: ${result.latency.p50}ms  p95: ${result.latency.p97_5 ?? result.latency.p95}ms  p99: ${result.latency.p99}ms`);
  console.log(`2xx: ${result["2xx"]}  3xx: ${result["3xx"] ?? 0}  4xx: ${result["4xx"] ?? 0}  5xx: ${result["5xx"] ?? 0}  errors: ${result.errors}`);
  console.log(`Total requests: ${result.requests.total}  Duration: ${result.duration}s`);
}

async function runRedirectHit() {
  console.log("Scenario: redirect, single hot code (cache hit path)");
  const [code] = await createUrls(1, "hot");
  // Give the redirect an extra beat to make sure the cache-priming write
  // from /shorten has landed before the benchmark starts.
  await new Promise((r) => setTimeout(r, 200));

  const result = await autocannon({
    url: `${BASE_URL}/${code}`,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    followRedirects: false,
  });
  printResult(result);
}

async function runRedirectMiss() {
  const poolSize = 2000; // large relative to expected request volume, so most requests are first-touch (cold)
  console.log(`Scenario: redirect, ${poolSize} distinct cold codes (cache-miss-dominated path)`);
  console.log("Seeding rows directly in Postgres (bypassing the rate-limited HTTP API) and evicting any cache entries...");

  // Seed directly through the repository/DB layer rather than POST /shorten:
  // /shorten is intentionally rate-limited (Phase 2), and legitimately
  // bypassing that to seed 2000 fixture rows is a test-tooling concern, not
  // something the public API should ever allow.
  const urlRepository = require("../../src/repositories/urlRepository");
  const { generateCode } = require("../../src/utils/shortCode");
  const { redis } = require("../../src/cache/redisClient");
  const db = require("../../src/db/pool");

  const codes = [];
  for (let i = 0; i < poolSize; i++) {
    const code = generateCode();
    await urlRepository.insert(code, `https://example.com/cold-${i}`);
    codes.push(code);
  }
  // Explicitly evict - insert() here never touched the cache (unlike
  // /shorten), but this makes the "cold" precondition explicit rather than
  // relying on that implicitly.
  if (codes.length) await redis.del(...codes.map((c) => `code:${c}`));

  const requests = codes.map((code) => ({ method: "GET", path: `/${code}` }));

  const result = await autocannon({
    url: BASE_URL,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    requests,
    followRedirects: false,
  });
  printResult(result);
}

async function runShorten() {
  console.log("Scenario: POST /shorten under load");
  const result = await autocannon({
    url: `${BASE_URL}/shorten`,
    method: "POST",
    headers: { "content-type": "application/json" },
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    setupClient: (client) => {
      client.setBody(JSON.stringify({ originalUrl: `https://example.com/load-${Math.random()}` }));
    },
  });
  printResult(result);
}

async function runRateLimited() {
  console.log("Scenario: POST /shorten, concurrency intentionally above the configured rate limit");
  console.log("Expect a meaningful share of 4xx (429) responses - this is the rate limiter working as designed.");
  const result = await autocannon({
    url: `${BASE_URL}/shorten`,
    method: "POST",
    headers: { "content-type": "application/json" },
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    setupClient: (client) => {
      client.setBody(JSON.stringify({ originalUrl: `https://example.com/rl-${Math.random()}` }));
    },
  });
  printResult(result);
}

const scenarios = {
  "redirect-hit": runRedirectHit,
  "redirect-miss": runRedirectMiss,
  shorten: runShorten,
  "rate-limited": runRateLimited,
  redirect: runRedirectHit, // alias used by npm run load:redirect
};

const scenario = process.argv[2];
if (!scenarios[scenario]) {
  console.error(`Usage: node tests/load/run.js <${Object.keys(scenarios).join("|")}>`);
  process.exit(1);
}

scenarios[scenario]()
  .then(() => process.exit(0)) // some scenarios open a direct DB/Redis connection for seeding; exit explicitly rather than hang on open handles
  .catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
  });
