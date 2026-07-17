const Redis = require("ioredis");

// Shared Redis connection for rate limiting (and usable later for caching,
// session/presence tracking, or Socket.io's Redis adapter if you scale
// to multiple server instances).
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

redis.on("error", (err) => console.error("Redis connection error:", err.message));

module.exports = redis;
