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
  const hasProfile = !!(await prisma.profile.findUnique({ where: { userId: user.id } }));
  res.json({ token, userId: user.id, hasProfile });
});

// --- POST /auth/signup — email + password ---
// Creates a new account. Unlike phone/OTP, this doesn't confirm the person
// actually controls the email address (no verification link is sent — see
// COMPLIANCE_BRIEFING.md / BUG_AUDIT.md if you add real email delivery
// later and want to change that). `emailVerified` is tracked on the User
// model for exactly that future addition; it stays false until then.
const emailAuthSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/signup", async (req, res) => {
  const parsed = emailAuthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "An account with this email already exists — log in instead" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, lastActiveAt: new Date() },
  });

  const token = signToken(user);
  res.status(201).json({ token, userId: user.id, hasProfile: false });
});

// --- POST /auth/login — email + password ---
router.post("/login", async (req, res) => {
  const parsed = emailAuthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Same generic error whether the email doesn't exist or the password is
  // wrong — confirming which one it was lets an attacker enumerate
  // registered emails.
  if (!user || !user.passwordHash) return res.status(401).json({ error: "Incorrect email or password" });
  if (user.isBanned) return res.status(403).json({ error: "Account suspended", reason: user.bannedReason });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Incorrect email or password" });

  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

  const token = signToken(user);
  const hasProfile = !!(await prisma.profile.findUnique({ where: { userId: user.id } }));
  res.json({ token, userId: user.id, hasProfile });
});

module.exports = router;
