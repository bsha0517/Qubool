const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Two-tier admin access, backed by the real `adminRole` column on User:
//   MODERATOR   — can review/action reports, ban users
//   SUPER_ADMIN — everything a moderator can do, plus granting/revoking roles
//
// Regular users authenticate with the same JWT as everyone else; the role
// check happens server-side against the DB record on every request rather
// than trusting anything client-supplied, so a stolen/forged token alone
// can't grant admin access.
function requireRole(minRole) {
  const order = ["NONE", "MODERATOR", "SUPER_ADMIN"];
  return (req, res, next) => {
    if (order.indexOf(req.user.adminRole) < order.indexOf(minRole)) {
      return res.status(403).json({ error: `Requires ${minRole} role` });
    }
    next();
  };
}

router.use(requireAuth, requireRole("MODERATOR"));

// --- POST /admin/roles/:userId — SUPER_ADMIN grants/revokes a role ---
router.post("/roles/:userId", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { role } = req.body;
  if (!["NONE", "MODERATOR", "SUPER_ADMIN"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  const updated = await prisma.user.update({
    where: { id: req.params.userId },
    data: { adminRole: role },
    select: { id: true, phone: true, adminRole: true },
  });
  res.json(updated);
});

// --- GET /admin/reports — moderation queue ---
router.get("/reports", async (req, res) => {
  const status = req.query.status || "OPEN";
  const reports = await prisma.report.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      reportedUser: { include: { profile: true } },
      reportedBy: { select: { id: true, phone: true } },
    },
  });
  res.json(reports);
});

// --- PATCH /admin/reports/:id — resolve a report ---
router.patch("/reports/:id", async (req, res) => {
  const { status, moderatorNote, banUser } = req.body;
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { status, moderatorNote, resolvedAt: new Date() },
  });

  if (banUser) {
    await prisma.user.update({
      where: { id: report.reportedUserId },
      data: { isBanned: true, bannedReason: moderatorNote || report.reason },
    });
  }
  res.json(report);
});

// --- GET /admin/photos — pending photo moderation queue ---
// (Automated moderation runs on upload; this is for manual review of
// anything the classifier couldn't confidently pass or reject on its own,
// or that a user has appealed.)
router.get("/photos", async (req, res) => {
  const status = req.query.status || "PENDING";
  const photos = await prisma.photo.findMany({
    where: { moderationStatus: status },
    orderBy: { createdAt: "asc" },
    include: { profile: { select: { name: true, userId: true } } },
  });
  res.json(photos);
});

router.patch("/photos/:id", async (req, res) => {
  const { moderationStatus, moderationReason } = req.body;
  const photo = await prisma.photo.update({
    where: { id: req.params.id },
    data: { moderationStatus, moderationReason },
  });
  res.json(photo);
});

// --- GET /admin/stats — basic dashboard numbers ---
router.get("/stats", async (req, res) => {
  const [users, verifiedUsers, matches, openReports] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { verificationStatus: { not: "UNVERIFIED" } } }),
    prisma.match.count({ where: { status: "MATCHED" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
  ]);
  res.json({ users, verifiedUsers, matches, openReports });
});

// --- POST /admin/dev/reset-swipes — clear a user's swipe history ---
// A testing convenience, not a moderation feature: Discover excludes
// anyone the caller has already liked/passed, and there's no shell access
// on Render's free tier to run the seed script's RESET_SWIPES env var
// directly — this does the same thing over HTTP instead, gated behind
// SUPER_ADMIN so it can't be hit by a regular account.
//
// Deletes every MatchAction where the target user is the actor (their own
// swipes), and reverts any MATCHED rows they're part of to UNMATCHED. Does
// NOT touch other people's swipes — only clears what this account has done,
// so it's safe to run against your own test account repeatedly.
router.post("/dev/reset-swipes", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { phone, email } = req.body;
  if (!phone && !email) return res.status(400).json({ error: "Provide phone or email" });

  const target = await prisma.user.findUnique({ where: phone ? { phone } : { email } });
  if (!target) return res.status(404).json({ error: "No account found for that phone/email" });

  const outgoing = await prisma.matchAction.findMany({ where: { actorId: target.id }, select: { targetId: true } });
  for (const { targetId } of outgoing) {
    const [userAId, userBId] = [target.id, targetId].sort();
    const existingMatch = await prisma.match.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
    if (existingMatch && existingMatch.status === "MATCHED") {
      await prisma.match.update({ where: { id: existingMatch.id }, data: { status: "UNMATCHED", unmatchedAt: new Date() } });
    }
  }

  const deleted = await prisma.matchAction.deleteMany({ where: { actorId: target.id } });
  res.json({ message: `Cleared ${deleted.count} swipe records for ${phone || email} — Discover will show everyone again.` });
});

module.exports = router;
