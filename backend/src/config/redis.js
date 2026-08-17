const Redis = require("ioredis");

// Defends against a common copy-paste mistake: pasting an env var value
// with its surrounding quote marks still attached (e.g. `"rediss://..."`
// instead of `rediss://...`). Render (and some other platforms) store the
// value exactly as typed — quotes included — which breaks ioredis's URL
// parser and, left unhandled, can crash the whole process. Stripping
// wrapping quotes/whitespace here means a mistake in the dashboard doesn't
// take down the API.
function sanitizeRedisUrl(url) {
  return url.trim().replace(/^['"]|['"]$/g, "");
}

// Shared Redis connection for rate limiting (and usable later for caching,
// session/presence tracking, or Socket.io's Redis adapter if you scale
// to multiple server instances).
const redis = new Redis(sanitizeRedisUrl(process.env.REDIS_URL || "redis://localhost:6379"), {
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

redis.on("error", (err) => console.error("Redis connection error:", err.message));

module.exports = redis;
