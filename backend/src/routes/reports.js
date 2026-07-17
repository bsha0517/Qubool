const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const reportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.enum(["FAKE_PROFILE", "HARASSMENT", "INAPPROPRIATE_CONTENT", "SCAM_OR_SOLICITATION", "UNDERAGE", "OTHER"]),
  details: z.string().max(1000).optional(),
});

// --- POST /reports — file a report against another user ---
router.post("/", async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const report = await prisma.report.create({
    data: { reportedById: req.user.id, ...parsed.data },
  });

  // UNDERAGE and HARASSMENT reports should page a human moderator immediately
  // rather than sit in a queue — wire this to your alerting system.
  res.status(201).json({ message: "Report received. Our safety team will review it.", reportId: report.id });
});

// --- GET /reports/mine — reports the caller has filed (status tracking) ---
router.get("/mine", async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { reportedById: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(reports);
});

module.exports = router;
