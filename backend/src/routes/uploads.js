const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { getSignedUploadUrl, isConfigured } = require("../services/uploads");

const router = express.Router();

const requestSchema = z.object({
  purpose: z.enum(["profile-photo", "cnic-front", "cnic-back", "selfie"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

// --- POST /uploads/signed-url ---
// Client asks for a place to PUT a file directly to storage, then reports
// the returned publicUrl/key back to /profile/photos or /verification/id.
router.post("/signed-url", requireAuth, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const result = await getSignedUploadUrl({ userId: req.user.id, ...parsed.data });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// --- PUT /uploads/local/:key — dev-only fallback receiving endpoint ---
// Only reachable/meaningful when AWS isn't configured (see services/uploads.js).
// Requires the signed short-lived token issued alongside the URL, so this
// can't be used to write arbitrary files without a valid signed-url request first.
router.put("/local/:key(*)", express.raw({ type: () => true, limit: `${process.env.MAX_UPLOAD_MB || 8}mb` }), (req, res) => {
  if (isConfigured) return res.status(404).json({ error: "Not available — AWS storage is configured" });

  const { token } = req.query;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired upload token" });
  }
  if (payload.key !== req.params.key) return res.status(403).json({ error: "Token does not match this upload" });

  const destPath = path.join(UPLOAD_DIR, payload.key);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, req.body);

  res.status(200).json({ message: "Uploaded" });
});

module.exports = { router, UPLOAD_DIR };
