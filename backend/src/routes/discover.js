const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const DAILY_BATCH_SIZE = 10;

// --- GET /discover — today's curated batch ---
// Deliberately NOT infinite-scroll: returns a bounded batch, excludes
// people already liked/passed, and applies the viewer's own discovery
// filters (gender preference, age range, same-city-only). Filters are
// one-directional — they narrow what THIS user sees, not who can see them;
// mirroring Tinder's actual behavior would need bidirectional matching
// (also filtering by the candidate's preferences), which is a reasonable
// follow-up but adds real query complexity for a first pass.
router.get("/", async (req, res) => {
  const myProfile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!myProfile) return res.status(404).json({ error: "Complete your profile first" });

  const alreadyActed = await prisma.matchAction.findMany({
    where: { actorId: req.user.id },
    select: { targetId: true },
  });
  const excludeIds = new Set([req.user.id, ...alreadyActed.map((a) => a.targetId)]);

  const candidates = await prisma.profile.findMany({
    where: {
      userId: { notIn: [...excludeIds] },
      gender: myProfile.preferredGender === "ANY" ? undefined : myProfile.preferredGender,
      intention: myProfile.intention,
      age: { gte: myProfile.ageMin, lte: myProfile.ageMax },
      city: myProfile.sameCityOnly ? myProfile.city : undefined,
      user: { isBanned: false, isActive: true },
    },
    include: {
      photos: { where: { moderationStatus: "PASSED" }, orderBy: { order: "asc" } },
      prompts: { orderBy: { order: "asc" }, take: 3 },
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
      education: c.education,
      bio: c.bio,
      verified: c.user.verificationStatus !== "UNVERIFIED",
      photos: c.blurPhotosDefault ? c.photos.map((p) => ({ ...p, url: null, blurred: true })) : c.photos,
      prompts: c.prompts.map((p) => ({ question: p.question, answer: p.answer })),
    }))
  );
});

// --- GET /discover/likes-received — "who liked you" ---
// Everyone who has liked the caller and hasn't been responded to yet
// (i.e. no MatchAction from the caller toward them exists). Once the
// caller likes or passes on someone from this list, they drop off it —
// via /discover/action same as a normal swipe.
router.get("/likes-received", async (req, res) => {
  const myProfile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!myProfile) return res.status(404).json({ error: "Complete your profile first" });

  const likesReceived = await prisma.matchAction.findMany({
    where: { targetId: req.user.id, action: "LIKE" },
    select: { actorId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const alreadyActed = await prisma.matchAction.findMany({
    where: { actorId: req.user.id },
    select: { targetId: true },
  });
  const respondedTo = new Set(alreadyActed.map((a) => a.targetId));

  const pendingActorIds = likesReceived.map((l) => l.actorId).filter((id) => !respondedTo.has(id));
  if (pendingActorIds.length === 0) return res.json([]);

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: pendingActorIds }, user: { isBanned: false, isActive: true } },
    include: {
      photos: { where: { moderationStatus: "PASSED" }, orderBy: { order: "asc" } },
      prompts: { orderBy: { order: "asc" }, take: 3 },
      user: { select: { verificationStatus: true } },
    },
  });

  // Preserve most-recent-like-first ordering from the MatchAction query
  // above, since the profile query above doesn't guarantee an order.
  const orderIndex = new Map(pendingActorIds.map((id, i) => [id, i]));
  profiles.sort((a, b) => orderIndex.get(a.userId) - orderIndex.get(b.userId));

  res.json(
    profiles.map((c) => ({
      profileId: c.id,
      userId: c.userId,
      name: c.name,
      age: c.age,
      city: c.city,
      intention: c.intention,
      education: c.education,
      bio: c.bio,
      verified: c.user.verificationStatus !== "UNVERIFIED",
      photos: c.blurPhotosDefault ? c.photos.map((p) => ({ ...p, url: null, blurred: true })) : c.photos,
      prompts: c.prompts.map((p) => ({ question: p.question, answer: p.answer })),
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

// --- POST /discover/undo — undo a swipe (like or pass) ---
// Deletes the actor's own MatchAction toward targetUserId. If that like had
// already produced a match (both sides liked), the match is reverted to
// UNMATCHED rather than left dangling on a like that no longer exists —
// this only ever touches the calling user's own action, so it can't be used
// to retract someone else's like of them.
const undoSchema = z.object({ targetUserId: z.string().uuid() });

router.post("/undo", async (req, res) => {
  const parsed = undoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { targetUserId } = parsed.data;

  const action = await prisma.matchAction.findUnique({
    where: { actorId_targetId: { actorId: req.user.id, targetId: targetUserId } },
  });
  if (!action) return res.status(404).json({ error: "No swipe to undo" });

  const [userAId, userBId] = [req.user.id, targetUserId].sort();
  const existingMatch = await prisma.match.findUnique({ where: { userAId_userBId: { userAId, userBId } } });

  await prisma.$transaction([
    prisma.matchAction.delete({ where: { actorId_targetId: { actorId: req.user.id, targetId: targetUserId } } }),
    ...(existingMatch && existingMatch.status === "MATCHED"
      ? [prisma.match.update({ where: { id: existingMatch.id }, data: { status: "UNMATCHED", unmatchedAt: new Date() } })]
      : []),
  ]);

  res.json({ message: "Undone" });
});

module.exports = router;
