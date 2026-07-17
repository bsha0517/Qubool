const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const { moderateImage } = require("../services/imageModeration");

const router = express.Router();
router.use(requireAuth);

const profileSchema = z.object({
  name: z.string().min(2).max(60),
  age: z.number().int().min(18).max(80),
  gender: z.enum(["MALE", "FEMALE"]),
  city: z.string().min(2).max(60),
  intention: z.enum(["MARRIAGE", "SERIOUS_RELATIONSHIP", "FRIENDSHIP"]),
  sect: z.string().max(40).optional(),
  religiosityLevel: z.string().max(40).optional(),
  education: z.string().max(100).optional(),
  profession: z.string().max(100).optional(),
  familyBackground: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  blurPhotosDefault: z.boolean().optional(),
  guardianModeOn: z.boolean().optional(),
  showFamilyBackground: z.boolean().optional(),
});

// --- POST /profile — create profile (once, post-verification) ---
router.post("/", async (req, res) => {
  if (req.user.verificationStatus === "UNVERIFIED") {
    return res.status(403).json({ error: "Verify your phone number before creating a profile" });
  }
  const existing = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (existing) return res.status(409).json({ error: "Profile already exists — use PATCH to update" });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const profile = await prisma.profile.create({ data: { ...parsed.data, userId: req.user.id } });
  res.status(201).json(profile);
});

// --- PATCH /profile — update own profile ---
router.patch("/", async (req, res) => {
  const parsed = profileSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const profile = await prisma.profile.update({
    where: { userId: req.user.id },
    data: parsed.data,
  });
  res.json(profile);
});

// --- GET /profile/me ---
router.get("/me", async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.user.id },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!profile) return res.status(404).json({ error: "No profile yet" });
  res.json(profile);
});

// --- POST /profile/photos — register an uploaded photo, then moderate it ---
// The client uploads bytes directly to storage via /uploads/signed-url first
// (see routes/uploads.js), then calls this with the resulting url + s3Key.
// The photo is created as PENDING and hidden from discovery until it passes
// moderation, so nothing unreviewed is ever shown to other users.
router.post("/photos", async (req, res) => {
  const schema = z.object({
    url: z.string().url(),
    s3Key: z.string().min(1),
    order: z.number().int().min(0).default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: "Create your profile first" });

  const photo = await prisma.photo.create({
    data: {
      profileId: profile.id,
      url: parsed.data.url,
      order: parsed.data.order,
      isPrimary: parsed.data.order === 0,
      moderationStatus: "PENDING",
    },
  });

  // Moderate synchronously for the MVP; move this to a background queue
  // (SQS/BullMQ) once upload volume makes inline calls too slow.
  const { passed, reason } = await moderateImage(parsed.data.s3Key);
  // passed: true -> PASSED, false -> REJECTED, null -> couldn't be
  // automatically decided (e.g. Rekognition call errored) -> PENDING for
  // a human moderator, not auto-rejected.
  const moderationStatus = passed === true ? "PASSED" : passed === false ? "REJECTED" : "PENDING";
  const updated = await prisma.photo.update({
    where: { id: photo.id },
    data: { moderationStatus, moderationReason: reason },
  });

  res.status(201).json(updated);
});

module.exports = router;
