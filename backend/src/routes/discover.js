const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const DAILY_BATCH_SIZE = 10;

// --- GET /discover — today's curated batch ---
// Deliberately NOT infinite-scroll: returns a bounded batch, excludes
// people already liked/passed, and matches on intention + basic filters.
router.get("/", async (req, res) => {
  const myProfile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!myProfile) return res.status(404).json({ error: "Complete your profile first" });

  const alreadyActed = await prisma.matchAction.findMany({
    where: { actorId: req.user.id },
    select: { targetId: true },
  });
  const excludeIds = new Set([req.user.id, ...alreadyActed.map((a) => a.targetId)]);

  // Simple opposite-gender + intention-compatible + not-yet-seen query.
  // Replace with a proper ranking model later (activity, mutual interests, etc).
  const candidates = await prisma.profile.findMany({
    where: {
      userId: { notIn: [...excludeIds] },
      gender: myProfile.gender === "MALE" ? "FEMALE" : "MALE",
      intention: myProfile.intention,
      user: { isBanned: false, isActive: true },
    },
    include: {
      photos: { where: { moderationStatus: "PASSED" }, orderBy: { order: "asc" }, take: 3 },
      user: { select: { verificationStatus: true } },
    },
    take: DAILY_BATCH_SIZE,
    orderBy: { updatedAt: "desc" },
  });

  res.json(
    candidates.map((c) => ({
      profileId: c.id,
      userId: c.userId,
      name: c.name,
      age: c.age,
      city: c.city,
      intention: c.intention,
      sect: c.sect,
      education: c.education,
      bio: c.bio,
      verified: c.user.verificationStatus !== "UNVERIFIED",
      photos: c.blurPhotosDefault ? c.photos.map((p) => ({ ...p, url: null, blurred: true })) : c.photos,
    }))
  );
});

// --- POST /discover/action — like or pass on a profile ---
const actionSchema = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["LIKE", "PASS"]),
});

router.post("/action", async (req, res) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { targetUserId, action } = parsed.data;

  if (targetUserId === req.user.id) return res.status(400).json({ error: "Cannot act on your own profile" });

  await prisma.matchAction.upsert({
    where: { actorId_targetId: { actorId: req.user.id, targetId: targetUserId } },
    update: { action },
    create: { actorId: req.user.id, targetId: targetUserId, action },
  });

  let matched = false;
  let match = null;

  if (action === "LIKE") {
    const reciprocal = await prisma.matchAction.findUnique({
      where: { actorId_targetId: { actorId: targetUserId, targetId: req.user.id } },
    });
    if (reciprocal && reciprocal.action === "LIKE") {
      const [userAId, userBId] = [req.user.id, targetUserId].sort();
      match = await prisma.match.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        // If a previous match between these two was unmatched and both
        // sides like each other again, reactivate it instead of leaving
        // the stale UNMATCHED status in place.
        update: { status: "MATCHED", matchedAt: new Date(), unmatchedAt: null },
        create: { userAId, userBId },
      });
      matched = true;
    }
  }

  res.json({ matched, match });
});

module.exports = router;
