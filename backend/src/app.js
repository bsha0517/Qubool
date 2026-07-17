// Must be required before anything else touches Express — it patches
// Express's router so that a rejected promise inside an `async (req, res)`
// handler is forwarded to the error-handling middleware below, instead of
// becoming an unhandled promise rejection that can crash the whole process.
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const redis = require("./config/redis");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const discoverRoutes = require("./routes/discover");
const matchesRoutes = require("./routes/matches");
const guardianRoutes = require("./routes/guardian");
const reportsRoutes = require("./routes/reports");
const adminRoutes = require("./routes/admin");
const verificationRoutes = require("./routes/verification");
const { router: uploadsRoutes, UPLOAD_DIR } = require("./routes/uploads");

// Redis-backed rate limiting: counters are shared across all API instances
// instead of living in each process's memory, so limits hold up once this
// runs behind a load balancer with more than one server.
function redisStore(prefix) {
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix,
  });
}

function createApp(io) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  // Attach io so route handlers can emit real-time events (see matches.js)
  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  // Generous general limit, tighter limit specifically on OTP requests
  // below to prevent SMS-bombing abuse. Both counters live in Redis.
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, store: redisStore("rl:general:") }));
  const otpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: "Too many OTP requests — try again later" },
    store: redisStore("rl:otp:"),
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.use("/auth/otp", otpLimiter);
  app.use("/auth", authRoutes);
  app.use("/profile", profileRoutes);
  app.use("/discover", discoverRoutes);
  app.use("/matches", matchesRoutes);
  app.use("/guardian", guardianRoutes);
  app.use("/reports", reportsRoutes);
  app.use("/admin", adminRoutes);
  app.use("/verification", verificationRoutes);
  app.use("/uploads", uploadsRoutes);
  // Serves files written by the local-disk dev upload fallback (see
  // services/uploads.js) — only ever populated when AWS isn't configured.
  app.use("/uploads/static", express.static(UPLOAD_DIR));

  // Central error handler — catches everything now that express-async-errors
  // forwards async rejections here too, so a single bad request (e.g. an
  // update against a deleted record) returns a normal error response
  // instead of taking the whole server down.
  app.use((err, req, res, next) => {
    console.error(err);

    // Prisma's "record not found" on update/delete — surface as 404 rather
    // than a generic 500, since this is almost always a bad/stale ID.
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Not found" });
    }
    // Unique constraint violation — surface as 409 conflict.
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Already exists" });
    }

    res.status(err.status || 500).json({ error: err.message || "Internal server error" });
  });

  return app;
}

module.exports = createApp;
