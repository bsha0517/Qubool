const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Guardian mode is entirely opt-in and controlled by the ward (the app
// user), never by the guardian. A guardian only ever gets READ access to
// match existence + timestamps — never message content — unless the ward
// explicitly shares a conversation.

// --- POST /guardian/invite — ward invites a guardian by phone number ---
const inviteSchema = z.object({ guardianPhone: z.string().regex(/^\+92\d{10}$/) });

router.post("/invite", async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  let guardianUser = await prisma.user.findUnique({ where: { phone: parsed.data.guardianPhone } });
  if (!guardianUser) {
    guardianUser = await prisma.user.create({ data: { phone: parsed.data.guardianPhone } });
  }

  const link = await prisma.guardianLink.upsert({
    where: { wardId_guardianId: { wardId: req.user.id, guardianId: guardianUser.id } },
    update: {},
    create: { wardId: req.user.id, guardianId: guardianUser.id, approvedByWard: true },
  });

  // TODO: send an SMS to the guardian explaining what they'll be able to see,
  // with a link to accept/decline the role.
  res.status(201).json(link);
});

// --- DELETE /guardian/:linkId — ward revokes a guardian at any time ---
router.delete("/:linkId", async (req, res) => {
  const link = await prisma.guardianLink.findUnique({ where: { id: req.params.linkId } });
  if (!link || link.wardId !== req.user.id) return res.status(404).json({ error: "Not found" });

  await prisma.guardianLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
  res.json({ message: "Guardian access revoked" });
});

// --- GET /guardian/wards — matches the caller is a guardian for ---
router.get("/wards", async (req, res) => {
  const links = await prisma.guardianLink.findMany({
    where: { guardianId: req.user.id, revokedAt: null, approvedByWard: true },
    include: { ward: { include: { profile: true } } },
  });

  const wardSummaries = await Promise.all(
    links.map(async (l) => {
      if (!l.ward.profile?.guardianModeOn) return null; // ward can toggle off anytime
      const matchCount = await prisma.match.count({
        where: { status: "MATCHED", OR: [{ userAId: l.wardId }, { userBId: l.wardId }] },
      });
      return { wardId: l.wardId, wardName: l.ward.profile?.name, activeMatchCount: matchCount };
    })
  );

  res.json(wardSummaries.filter(Boolean));
});

module.exports = router;
