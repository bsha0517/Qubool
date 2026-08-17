require("dotenv").config();
const prisma = require("../src/config/prisma");
const { seedDemoProfiles, autoLikeBack, resetSwipesAgainstSeed } = require("../src/services/seedDemoData");

async function main() {
  const { seededCount, seededUserIds } = await seedDemoProfiles();
  console.log(`Seeded super-admin (+923009999999) and ${seededCount} demo profiles with photos and prompts.`);

  // --- Optional: reset YOUR OWN swipe history against just the seed
  // profiles, so you can re-test Discover from scratch without needing a
  // new phone number every time. Discover excludes anyone you've already
  // liked/passed — if you swiped through all the seed profiles in an
  // earlier test session, re-running the seed step above alone won't give
  // you anyone new to see, since it only upserts the same 12 people rather
  // than creating fresh ones.
  //
  // Usage: RESET_SWIPES_FOR_PHONE=+923001234567 npm run seed
  // (or RESET_SWIPES_FOR_EMAIL=you@example.com)
  const resetPhone = process.env.RESET_SWIPES_FOR_PHONE;
  const resetEmail = process.env.RESET_SWIPES_FOR_EMAIL;
  if (resetPhone || resetEmail) {
    const result = await resetSwipesAgainstSeed(seededUserIds, { phone: resetPhone, email: resetEmail });
    console.log(result.ok ? result.message : `Warning: ${result.message}`);
  }

  // --- Optional: make every seed profile "like" a real account back, so
  // swiping right on any of them instantly produces a match.
  //
  // Usage: AUTO_LIKE_PHONE=+923001234567 npm run seed
  // (or AUTO_LIKE_EMAIL=you@example.com)
  const likePhone = process.env.AUTO_LIKE_PHONE;
  const likeEmail = process.env.AUTO_LIKE_EMAIL;
  if (likePhone || likeEmail) {
    const result = await autoLikeBack(seededUserIds, { phone: likePhone, email: likeEmail });
    console.log(result.ok ? result.message : `Warning: ${result.message}`);
  } else if (!resetPhone && !resetEmail) {
    console.log("Tip: re-run with AUTO_LIKE_PHONE=<your phone> (or AUTO_LIKE_EMAIL=<your email>) to make seed profiles like you back instantly.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
