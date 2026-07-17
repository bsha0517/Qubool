const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth, requireVerification } = require("../middleware/auth");
const { screenMessage } = require("../utils/moderation");

const router = express.Router();
router.use(requireAuth);

function otherUserId(match, myId) {
  return match.userAId === myId ? match.userBId : match.userAId;
}

// --- GET /matches — list my active matches ---
router.get("/", async (req, res) => {
  const matches = await prisma.match.findMany({
    where: {
      status: "MATCHED",
      OR: [{ userAId: req.user.id }, { userBId: req.user.id }],
    },
    orderBy: { matchedAt: "desc" },
  });

  const enriched = await Promise.all(
    matches.map(async (m) => {
      const otherId = otherUserId(m, req.user.id);
      const otherProfile = await prisma.profile.findUnique({
        where: { userId: otherId },
        include: { photos: { take: 1, orderBy: { order: "asc" } } },
      });
      const lastMessage = await prisma.message.findFirst({
        where: { matchId: m.id },
        orderBy: { createdAt: "desc" },
      });
      return {
        matchId: m.id,
        matchedAt: m.matchedAt,
        otherUser: { userId: otherId, name: otherProfile?.name, photo: otherProfile?.photos[0]?.url },
        lastMessage: lastMessage?.body || null,
      };
    })
  );

  res.json(enriched);
});

// --- GET /matches/:matchId/messages ---
router.get("/:matchId/messages", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (![match.userAId, match.userBId].includes(req.user.id)) return res.status(403).json({ error: "Not your match" });

  const messages = await prisma.message.findMany({
    where: { matchId: match.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  res.json(messages);
});

// --- POST /matches/:matchId/messages — send a message ---
// Requires phone verification, since anonymous unverified accounts
// messaging real users is a common abuse vector on matrimonial apps.
const messageSchema = z.object({ body: z.string().min(1).max(2000) });

router.post("/:matchId/messages", requireVerification("PHONE_VERIFIED"), async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (![match.userAId, match.userBId].includes(req.user.id)) return res.status(403).json({ error: "Not your match" });
  if (match.status !== "MATCHED") return res.status(400).json({ error: "This match is no longer active" });

  const { flagged, severity, categories } = await screenMessage(parsed.data.body);

  const message = await prisma.message.create({
    data: {
      matchId: match.id,
      senderId: req.user.id,
      body: parsed.data.body,
      flaggedByAi: flagged,
    },
  });

  // High-severity content (threats, sexual content involving minors,
  // self-harm intent) auto-files a report for immediate human review
  // rather than waiting for the recipient to report it themselves.
  if (severity === "HIGH") {
    await prisma.report.create({
      data: {
        reportedById: req.user.id, // system-detected; reportedBy is the sender's own account for audit trail
        reportedUserId: req.user.id,
        reason: "OTHER",
        details: `Auto-flagged by content classifier (${categories.join(", ")}) in match ${match.id}, message ${message.id}`,
        status: "OPEN",
      },
    });
  }

  // Real-time delivery is wired in server.js via socket.io using the
  // `match:${matchId}` room — see io.to(...) emit on message:new.
  req.io?.to(`match:${match.id}`).emit("message:new", message);

  res.status(201).json(message);
});

// --- POST /matches/:matchId/unmatch ---
router.post("/:matchId/unmatch", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (![match.userAId, match.userBId].includes(req.user.id)) return res.status(403).json({ error: "Not your match" });

  await prisma.match.update({
    where: { id: match.id },
    data: { status: "UNMATCHED", unmatchedAt: new Date() },
  });
  res.json({ message: "Unmatched" });
});

module.exports = router;
