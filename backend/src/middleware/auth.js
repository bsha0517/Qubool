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

// Gate certain actions (e.g. sending messages) behind phone verification.
// Levels are assigned by what the status actually implies about phone
// verification, not by enum declaration order — ID_PENDING and REJECTED
// both mean "phone was verified, ID verification is in progress or didn't
// pass," so they must stay at the PHONE_VERIFIED level, not fall below it.
const VERIFICATION_LEVEL = {
  UNVERIFIED: 0,
  PHONE_VERIFIED: 1,
  ID_PENDING: 1,
  REJECTED: 1,
  ID_VERIFIED: 2,
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

module.exports = { requireAuth, requireVerification };
