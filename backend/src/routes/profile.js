const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const { moderateImage } = require("../services/imageModeration");

const router = express.Router();
router.use(requireAuth);

const profileFields = z.object({
  name: z.string().min(2).max(60),
  age: z.number().int().min(18).max(80),
  gender: z.enum(["MALE", "FEMALE"]),
  city: z.string().min(2).max(60),
  intention: z.enum(["DATING", "FRIENDSHIP"]),
  education: z.string().max(100).optional(),
  profession: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  blurPhotosDefault: z.boolean().optional(),
  // --- discovery filters ---
  preferredGender: z.enum(["MALE", "FEMALE", "ANY"]).optional(),
  ageMin: z.number().int().min(18).max(80).optional(),
  ageMax: z.number().int().min(18).max(80).optional(),
  sameCityOnly: z.boolean().optional(),
});

const ageRangeCheck = (data) => data.ageMin === undefined || data.ageMax === undefined || data.ageMin <= data.ageMax;
const ageRangeIssue = { message: "ageMin must be less than or equal to ageMax", path: ["ageMin"] };

const profileSchema = profileFields.refine(ageRangeCheck, ageRangeIssue);
const profileUpdateSchema = profileFields.partial().refine(ageRangeCheck, ageRangeIssue);

// --- POST /profile — create profile (once account is confirmed real) ---
router.post("/", async (req, res) => {
  // "Confirmed real" means either phone OTP was completed, or the account
  // was created via email+password (having a password on file is itself a
  // deliberate signup action, even without a confirmation-link email flow).
  const hasVerifiedAccount = req.user.verificationStatus !== "UNVERIFIED" || !!req.user.passwordHash;
  if (!hasVerifiedAccount) {
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
  const parsed = profileUpdateSchema.safeParse(req.body);
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
    include: {
      photos: { orderBy: { order: "asc" } },
      prompts: { orderBy: { order: "asc" } },
    },
  });
  if (!profile) return res.status(404).json({ error: "No profile yet" });
  res.json(profile);
});

// --- POST /profile/photos — register an uploaded photo, then moderate it ---
// The client uploads bytes directly to storage via /uploads/signed-url first
// (see routes/uploads.js), then calls this with the resulting url + s3Key.
// The photo is created as PENDING and hidden from discovery until it passes
// moderation, so nothing unreviewed is ever shown to other users.
const MAX_PHOTOS = 6;

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

  const existingCount = await prisma.photo.count({ where: { profileId: profile.id } });
  if (existingCount >= MAX_PHOTOS) {
    return res.status(400).json({ error: `You can have at most ${MAX_PHOTOS} photos — delete one first` });
  }

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

// --- DELETE /profile/photos/:id ---
router.delete("/photos/:id", async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: "No profile" });

  const photo = await prisma.photo.findUnique({ where: { id: req.params.id } });
  if (!photo || photo.profileId !== profile.id) return res.status(404).json({ error: "Photo not found" });

  await prisma.photo.delete({ where: { id: photo.id } });
  res.json({ message: "Deleted" });
});

// --- PATCH /profile/photos/reorder — set the display order of all photos ---
// Body: { order: [photoId1, photoId2, ...] } — full list, in the desired
// order. The first one becomes the primary/profile photo.
router.patch("/photos/reorder", async (req, res) => {
  const schema = z.object({ order: z.array(z.string().uuid()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: "No profile" });

  const ownedPhotos = await prisma.photo.findMany({ where: { profileId: profile.id }, select: { id: true } });
  const ownedIds = new Set(ownedPhotos.map((p) => p.id));
  const allOwned = parsed.data.order.every((id) => ownedIds.has(id));
  if (!allOwned || parsed.data.order.length !== ownedIds.size) {
    return res.status(400).json({ error: "Order must include exactly your own photo IDs" });
  }

  await prisma.$transaction(
    parsed.data.order.map((id, index) =>
      prisma.photo.update({ where: { id }, data: { order: index, isPrimary: index === 0 } })
    )
  );

  const photos = await prisma.photo.findMany({ where: { profileId: profile.id }, orderBy: { order: "asc" } });
  res.json(photos);
});

// --- PUT /profile/prompts — replace all prompts (max 3) ---
const promptsSchema = z.object({
  prompts: z
    .array(
      z.object({
        question: z.string().min(3).max(120),
        answer: z.string().min(1).max(300),
      })
    )
    .max(3),
});

router.put("/prompts", async (req, res) => {
  const parsed = promptsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: "Create your profile first" });

  await prisma.$transaction([
    prisma.profilePrompt.deleteMany({ where: { profileId: profile.id } }),
    ...parsed.data.prompts.map((p, index) =>
      prisma.profilePrompt.create({ data: { profileId: profile.id, question: p.question, answer: p.answer, order: index } })
    ),
  ]);

  const prompts = await prisma.profilePrompt.findMany({ where: { profileId: profile.id }, orderBy: { order: "asc" } });
  res.json(prompts);
});

module.exports = router;
