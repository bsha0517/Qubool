const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { z } = require("zod");
const prisma = require("../config/prisma");
const { sendOtpSms } = require("../services/sms");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// --- POST /auth/otp/request ---
// Sends a 6-digit OTP to a Pakistani phone number. Creates the user
// record on first contact (unverified) so we have somewhere to attach the code.
const requestOtpSchema = z.object({
  phone: z.string().regex(/^\+92\d{10}$/, "Use E.164 format, e.g. +923001234567"),
});

router.post("/otp/request", async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { phone } = parsed.data;

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone } });
  }
  if (user.isBanned) return res.status(403).json({ error: "This number is suspended" });

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.otpCode.create({
    data: {
      userId: user.id,
      codeHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    },
  });

  await sendOtpSms(phone, code);

  res.json({ message: "OTP sent" });
});

// --- POST /auth/otp/verify ---
const verifyOtpSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
});

router.post("/otp/verify", async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { phone, code } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return res.status(404).json({ error: "Unknown phone number" });

  const otp = await prisma.otpCode.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return res.status(400).json({ error: "No active code — request a new one" });

  const valid = await bcrypt.compare(code, otp.codeHash);
  if (!valid) return res.status(400).json({ error: "Incorrect code" });

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: user.id },
      data: { phoneVerified: true, verificationStatus: "PHONE_VERIFIED", lastActiveAt: new Date() },
    }),
  ]);

  const token = signToken(user);
  res.json({ token, userId: user.id, hasProfile: false });
});

// --- POST /auth/login (returning users with completed profile) ---
router.post("/login", async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  // Login re-uses the OTP flow — dating/matrimonial apps should not use
  // static passwords as the primary factor given SIM-swap / account-takeover risk.
  res.json({ message: "Use /auth/otp/request then /auth/otp/verify to log in" });
});

module.exports = router;
