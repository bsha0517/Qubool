const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const { submitIdVerification, checkIdVerificationStatus } = require("../services/idVerification");

const router = express.Router();
router.use(requireAuth);

// --- POST /verification/id — submit CNIC + selfie for KYC review ---
// Expects the client to have already uploaded the three images (see
// routes/uploads.js) and to pass the resulting URLs here.
const submitSchema = z.object({
  cnicNumber: z.string().regex(/^\d{13}$/, "CNIC must be 13 digits, no dashes"),
  cnicFrontUrl: z.string().url(),
  cnicBackUrl: z.string().url(),
  selfieUrl: z.string().url(),
});

router.post("/id", async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.idVerification.findUnique({ where: { userId: req.user.id } });
  if (existing && existing.status === "PASSED") {
    return res.status(409).json({ error: "Already ID-verified" });
  }

  // Duplicate-account detection: block a second account from verifying
  // with a CNIC hash that's already PASSED on another user.
  const { hashCnic } = require("../services/idVerification");
  const cnicHash = hashCnic(parsed.data.cnicNumber);
  const duplicate = await prisma.idVerification.findFirst({
    where: { cnicHash, status: "PASSED", userId: { not: req.user.id } },
  });
  if (duplicate) return res.status(409).json({ error: "This CNIC is already linked to another account" });

  const result = await submitIdVerification(parsed.data);

  const verification = await prisma.idVerification.upsert({
    where: { userId: req.user.id },
    update: {
      provider: "kyc-provider",
      providerRefId: result.providerRefId,
      cnicHash: result.cnicHash,
      status: "PENDING",
      submittedAt: new Date(),
      decidedAt: null,
      rejectionReason: null,
    },
    create: {
      userId: req.user.id,
      provider: "kyc-provider",
      providerRefId: result.providerRefId,
      cnicHash: result.cnicHash,
      status: "PENDING",
    },
  });

  await prisma.user.update({ where: { id: req.user.id }, data: { verificationStatus: "ID_PENDING" } });

  res.status(202).json({ message: "Verification submitted — this can take a few minutes", verificationId: verification.id });
});

// --- GET /verification/id/status — poll for a decision ---
router.get("/id/status", async (req, res) => {
  const verification = await prisma.idVerification.findUnique({ where: { userId: req.user.id } });
  if (!verification) return res.status(404).json({ error: "No verification submitted yet" });

  if (verification.status === "PENDING") {
    const result = await checkIdVerificationStatus(verification.providerRefId);

    if (result.status !== "PENDING") {
      await prisma.idVerification.update({
        where: { userId: req.user.id },
        data: {
          status: result.status,
          livenessPassed: !!result.livenessPassed,
          nameMatchScore: result.nameMatchScore,
          rejectionReason: result.rejectionReason,
          decidedAt: new Date(),
        },
      });
      await prisma.user.update({
        where: { id: req.user.id },
        data: { verificationStatus: result.status === "PASSED" ? "ID_VERIFIED" : "REJECTED" },
      });
      return res.json({ status: result.status, rejectionReason: result.rejectionReason });
    }
  }

  res.json({ status: verification.status, rejectionReason: verification.rejectionReason });
});

module.exports = router;
