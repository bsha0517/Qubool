const prisma = require("../config/prisma");

// Unsplash photos are used directly (no upload/moderation pipeline needed
// for seed data) and marked PASSED so they show up in Discover immediately.
const SEED_USERS = [
  { phone: "+923001111111", name: "Ayesha", age: 27, gender: "FEMALE", city: "Lahore", intention: "DATING", education: "MBA, LUMS", bio: "Loves calligraphy and long walks along the canal.", photos: ["https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop", "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=800&fit=crop"], prompts: [{ q: "The key to my heart is", a: "Fresh calligraphy ink and a good debate about Urdu poetry." }, { q: "My simple pleasures", a: "Canal-side chai at sunset." }] },
  { phone: "+923002222222", name: "Hamza", age: 30, gender: "MALE", city: "Karachi", intention: "DATING", education: "Software Engineer", bio: "Coffee enthusiast, cricket fan, always up for new food spots.", photos: ["https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=800&fit=crop", "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600&h=800&fit=crop"], prompts: [{ q: "Two truths and a lie", a: "I've watched every Test match this year. I make terrible karahi. I once met Babar Azam." }] },
  { phone: "+923003333333", name: "Zara", age: 25, gender: "FEMALE", city: "Islamabad", intention: "FRIENDSHIP", education: "Doctor", bio: "Book lover, hiking on weekends, looking to expand my circle.", photos: ["https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=800&fit=crop"], prompts: [{ q: "Let's talk about", a: "Whatever you're reading right now." }, { q: "Best trail I've hiked", a: "Trail 3, Margalla Hills, at sunrise." }] },
  { phone: "+923004444444", name: "Bilal", age: 29, gender: "MALE", city: "Lahore", intention: "DATING", education: "Architect", bio: "Design-obsessed, plays the tabla badly but enthusiastically.", photos: ["https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=800&fit=crop"], prompts: [{ q: "The first item on my bucket list", a: "Sketch every old building in the Walled City." }] },
  { phone: "+923005555555", name: "Sana", age: 26, gender: "FEMALE", city: "Karachi", intention: "DATING", education: "Marketing Manager", bio: "Beach mornings, terrible karaoke, good playlists.", photos: ["https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=800&fit=crop"], prompts: [{ q: "My most controversial opinion", a: "Karaoke skill is overrated — confidence is everything." }] },
  { phone: "+923006666666", name: "Usman", age: 28, gender: "MALE", city: "Islamabad", intention: "FRIENDSHIP", education: "Civil Engineer", bio: "New to the city, looking for people to explore trails with.", photos: ["https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=800&fit=crop"], prompts: [{ q: "Let's talk about", a: "Where to find the best trails around Islamabad." }] },
  { phone: "+923007777777", name: "Mahnoor", age: 24, gender: "FEMALE", city: "Faisalabad", intention: "FRIENDSHIP", education: "Graphic Designer", bio: "Sketchbook always in my bag. Let's talk about movies.", photos: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=800&fit=crop"], prompts: [{ q: "Two truths and a lie", a: "I've seen every Miyazaki film. I hate popcorn. I can draw with both hands." }] },
  { phone: "+923008888888", name: "Ahmed", age: 31, gender: "MALE", city: "Rawalpindi", intention: "DATING", education: "Product Manager", bio: "Weekend cyclist, occasional chef, full-time dog dad.", photos: ["https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&h=800&fit=crop"], prompts: [{ q: "My simple pleasures", a: "A long ride, then a nap with my dog." }] },
  { phone: "+923010101010", name: "Hira", age: 29, gender: "FEMALE", city: "Lahore", intention: "DATING", education: "Lawyer", bio: "Debate club alum. I will out-argue you about pineapple on pizza.", photos: ["https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=800&fit=crop"], prompts: [{ q: "My most controversial opinion", a: "Pineapple belongs on pizza. Fight me." }] },
  { phone: "+923011111111", name: "Danish", age: 27, gender: "MALE", city: "Multan", intention: "DATING", education: "Entrepreneur", bio: "Building a small business, still finding time for cricket on Sundays.", photos: ["https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600&h=800&fit=crop"], prompts: [{ q: "The first item on my bucket list", a: "Actually take a full weekend off." }] },
  { phone: "+923012121212", name: "Alina", age: 23, gender: "FEMALE", city: "Peshawar", intention: "FRIENDSHIP", education: "Undergrad, Computer Science", bio: "New here, love board games and finding good chai spots.", photos: ["https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?w=600&h=800&fit=crop"], prompts: [{ q: "Let's talk about", a: "Board game recommendations, I'm building a collection." }] },
  { phone: "+923013131313", name: "Fahad", age: 32, gender: "MALE", city: "Karachi", intention: "FRIENDSHIP", education: "Doctor", bio: "Long shifts, but always down for a late-night food run.", photos: ["https://images.unsplash.com/photo-1618077360395-f3068be8e001?w=600&h=800&fit=crop"], prompts: [{ q: "My simple pleasures", a: "Food at 2am after a long shift, no judgment." }] },
];

// Creates the 12 demo profiles (idempotent — safe to call repeatedly,
// upserts by phone number) plus a super-admin account. Returns the seed
// users' User IDs, needed by the optional reset/auto-like steps below.
async function seedDemoProfiles() {
  await prisma.user.upsert({
    where: { phone: "+923009999999" },
    update: { adminRole: "SUPER_ADMIN" },
    create: { phone: "+923009999999", phoneVerified: true, verificationStatus: "PHONE_VERIFIED", adminRole: "SUPER_ADMIN" },
  });

  const seededUserIds = [];

  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: { phone: u.phone, phoneVerified: true, verificationStatus: "PHONE_VERIFIED" },
    });
    seededUserIds.push(user.id);

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: u.name,
        age: u.age,
        gender: u.gender,
        city: u.city,
        intention: u.intention,
        education: u.education,
        bio: u.bio,
        // Unblurred for seed/demo accounts specifically, so the discover
        // feed looks populated right away without requiring a match first.
        blurPhotosDefault: false,
      },
    });

    const existingPhoto = await prisma.photo.findFirst({ where: { profileId: profile.id } });
    if (!existingPhoto) {
      await Promise.all(
        u.photos.map((url, order) =>
          prisma.photo.create({
            data: { profileId: profile.id, url, order, isPrimary: order === 0, moderationStatus: "PASSED" },
          })
        )
      );
    }

    const existingPrompt = await prisma.profilePrompt.findFirst({ where: { profileId: profile.id } });
    if (!existingPrompt && u.prompts?.length) {
      await Promise.all(
        u.prompts.map((p, order) =>
          prisma.profilePrompt.create({ data: { profileId: profile.id, question: p.q, answer: p.a, order } })
        )
      );
    }
  }

  return { seededCount: SEED_USERS.length, seededUserIds };
}

// Makes every seed profile "like" the given user back, so swiping right on
// any of them produces an instant match — otherwise the seed accounts are
// static and can never reciprocate on their own.
async function autoLikeBack(seededUserIds, { phone, email }) {
  const targetUser = await prisma.user.findUnique({ where: phone ? { phone } : { email } });
  if (!targetUser) return { ok: false, message: `No account found for ${phone || email} — sign up/verify first.` };

  for (const actorId of seededUserIds) {
    await prisma.matchAction.upsert({
      where: { actorId_targetId: { actorId, targetId: targetUser.id } },
      update: { action: "LIKE" },
      create: { actorId, targetId: targetUser.id, action: "LIKE" },
    });
  }
  return { ok: true, message: `All ${seededUserIds.length} seed profiles now like ${phone || email} back.` };
}

// Clears the given user's own swipe history against the seed profiles
// specifically (both directions), reverting any resulting matches to
// UNMATCHED. Never touches swipes involving real (non-seed) users.
async function resetSwipesAgainstSeed(seededUserIds, { phone, email }) {
  const resetUser = await prisma.user.findUnique({ where: phone ? { phone } : { email } });
  if (!resetUser) return { ok: false, message: `No account found for ${phone || email} — sign up/verify first.` };

  for (const seedId of seededUserIds) {
    const [userAId, userBId] = [resetUser.id, seedId].sort();
    const existingMatch = await prisma.match.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
    if (existingMatch && existingMatch.status === "MATCHED") {
      await prisma.match.update({ where: { id: existingMatch.id }, data: { status: "UNMATCHED", unmatchedAt: new Date() } });
    }
  }
  const deleted = await prisma.matchAction.deleteMany({
    where: {
      OR: [
        { actorId: resetUser.id, targetId: { in: seededUserIds } },
        { actorId: { in: seededUserIds }, targetId: resetUser.id },
      ],
    },
  });
  return { ok: true, message: `Cleared ${deleted.count} swipe records between ${phone || email} and the seed profiles.` };
}

module.exports = { SEED_USERS, seedDemoProfiles, autoLikeBack, resetSwipesAgainstSeed };
