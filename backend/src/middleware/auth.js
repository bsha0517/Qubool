const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// Verifies the bearer JWT, attaches `req.user` (id, phone, verificationStatus).
// Also blocks banned accounts from doing anything authenticated.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) return res.status(401).json({ error: "Invalid session" });
    if (user.isBanned) return res.status(403).json({ error: "Account suspended", reason: user.bannedReason });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Gate certain actions (e.g. sending messages) behind phone verification
// specifically — used where the phone-verified "trust" badge really matters.
const VERIFICATION_LEVEL = {
  UNVERIFIED: 0,
  PHONE_VERIFIED: 1,
};

function requireVerification(minLevel = "PHONE_VERIFIED") {
  return (req, res, next) => {
    const userLevel = VERIFICATION_LEVEL[req.user.verificationStatus] ?? 0;
    const required = VERIFICATION_LEVEL[minLevel] ?? 0;
    if (userLevel < required) {
      return res.status(403).json({ error: `Requires verification level: ${minLevel}` });
    }
    next();
  };
}

// Broader gate for actions that just need "this isn't an anonymous/unverified
// account" — accepts EITHER completed phone OTP OR an email+password account
// (having a password on file is itself a deliberate signup action). Use this
// instead of requireVerification("PHONE_VERIFIED") for things like messaging,
// where the point is filtering out drive-by accounts, not specifically
// confirming phone ownership.
function requireVerifiedAccount(req, res, next) {
  const verified = req.user.verificationStatus !== "UNVERIFIED" || !!req.user.passwordHash;
  if (!verified) {
    return res.status(403).json({ error: "Verify your phone number or sign up with email to do this" });
  }
  next();
}

module.exports = { requireAuth, requireVerification, requireVerifiedAccount };
