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

// --- GET /admin/verifications — CNIC/ID review queue ---
// Covers cases the automated KYC provider couldn't confidently resolve,
// or that a moderator wants to double check (e.g. low name-match score).
router.get("/verifications", async (req, res) => {
  const status = req.query.status || "PENDING";
  const verifications = await prisma.idVerification.findMany({
    where: { status },
    orderBy: { submittedAt: "asc" },
    include: { user: { include: { profile: true } } },
  });
  res.json(verifications);
});

router.patch("/verifications/:id", async (req, res) => {
  const { status, rejectionReason } = req.body;
  const verification = await prisma.idVerification.update({
    where: { id: req.params.id },
    data: { status, rejectionReason, decidedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: verification.userId },
    data: { verificationStatus: status === "PASSED" ? "ID_VERIFIED" : "REJECTED" },
  });
  res.json(verification);
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

module.exports = router;
