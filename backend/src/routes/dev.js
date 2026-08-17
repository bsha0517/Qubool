const express = require("express");
const { z } = require("zod");
const { seedDemoProfiles, autoLikeBack, resetSwipesAgainstSeed } = require("../services/seedDemoData");

const router = express.Router();

// This exists specifically for hosts with no shell access (e.g. Render's
// free tier) — everywhere else, `npm run seed` (see prisma/seed.js) does
// the same thing and is the simpler option if you have shell.
//
// Protected by a shared secret rather than requireAuth/admin role, since
// this seeding step is what CREATES the super-admin account in the first
// place — there's no admin to authenticate as before it's ever run once.
// Only reachable at all if SEED_TRIGGER_SECRET is set; unset by default,
// so this route 404s in any deployment that hasn't deliberately opted in.
router.post("/seed", async (req, res) => {
  const configuredSecret = process.env.SEED_TRIGGER_SECRET;
  if (!configuredSecret) {
    return res.status(404).json({ error: "Not found" });
  }
  const providedSecret = req.headers["x-seed-secret"];
  if (providedSecret !== configuredSecret) {
    return res.status(403).json({ error: "Invalid or missing X-Seed-Secret header" });
  }

  const schema = z.object({
    autoLikePhone: z.string().optional(),
    autoLikeEmail: z.string().email().optional(),
    resetSwipesPhone: z.string().optional(),
    resetSwipesEmail: z.string().email().optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { autoLikePhone, autoLikeEmail, resetSwipesPhone, resetSwipesEmail } = parsed.data;

  const { seededCount, seededUserIds } = await seedDemoProfiles();
  const messages = [`Seeded super-admin (+923009999999) and ${seededCount} demo profiles.`];

  if (resetSwipesPhone || resetSwipesEmail) {
    const result = await resetSwipesAgainstSeed(seededUserIds, { phone: resetSwipesPhone, email: resetSwipesEmail });
    messages.push(result.message);
  }
  if (autoLikePhone || autoLikeEmail) {
    const result = await autoLikeBack(seededUserIds, { phone: autoLikePhone, email: autoLikeEmail });
    messages.push(result.message);
  }

  res.json({ messages });
});

module.exports = router;
