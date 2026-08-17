const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Unsplash photos are used directly (no upload/moderation pipeline needed
// for seed data) and marked PASSED so they show up in Discover immediately.
const SEED_USERS = [
  { phone: "+923001111111", name: "Ayesha", age: 27, gender: "FEMALE", city: "Lahore", intention: "DATING", education: "MBA, LUMS", bio: "Loves calligraphy and long walks along the canal.", photo: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop" },
  { phone: "+923002222222", name: "Hamza", age: 30, gender: "MALE", city: "Karachi", intention: "DATING", education: "Software Engineer", bio: "Coffee enthusiast, cricket fan, always up for new food spots.", photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=800&fit=crop" },
  { phone: "+923003333333", name: "Zara", age: 25, gender: "FEMALE", city: "Islamabad", intention: "FRIENDSHIP", education: "Doctor", bio: "Book lover, hiking on weekends, looking to expand my circle.", photo: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=800&fit=crop" },
  { phone: "+923004444444", name: "Bilal", age: 29, gender: "MALE", city: "Lahore", intention: "DATING", education: "Architect", bio: "Design-obsessed, plays the tabla badly but enthusiastically.", photo: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=800&fit=crop" },
  { phone: "+923005555555", name: "Sana", age: 26, gender: "FEMALE", city: "Karachi", intention: "DATING", education: "Marketing Manager", bio: "Beach mornings, terrible karaoke, good playlists.", photo: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=800&fit=crop" },
  { phone: "+923006666666", name: "Usman", age: 28, gender: "MALE", city: "Islamabad", intention: "FRIENDSHIP", education: "Civil Engineer", bio: "New to the city, looking for people to explore trails with.", photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=800&fit=crop" },
  { phone: "+923007777777", name: "Mahnoor", age: 24, gender: "FEMALE", city: "Faisalabad", intention: "FRIENDSHIP", education: "Graphic Designer", bio: "Sketchbook always in my bag. Let's talk about movies.", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=800&fit=crop" },
  { phone: "+923008888888", name: "Ahmed", age: 31, gender: "MALE", city: "Rawalpindi", intention: "DATING", education: "Product Manager", bio: "Weekend cyclist, occasional chef, full-time dog dad.", photo: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&h=800&fit=crop" },
  { phone: "+923010101010", name: "Hira", age: 29, gender: "FEMALE", city: "Lahore", intention: "DATING", education: "Lawyer", bio: "Debate club alum. I will out-argue you about pineapple on pizza.", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=800&fit=crop" },
  { phone: "+923011111111", name: "Danish", age: 27, gender: "MALE", city: "Multan", intention: "DATING", education: "Entrepreneur", bio: "Building a small business, still finding time for cricket on Sundays.", photo: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600&h=800&fit=crop" },
  { phone: "+923012121212", name: "Alina", age: 23, gender: "FEMALE", city: "Peshawar", intention: "FRIENDSHIP", education: "Undergrad, Computer Science", bio: "New here, love board games and finding good chai spots.", photo: "https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?w=600&h=800&fit=crop" },
  { phone: "+923013131313", name: "Fahad", age: 32, gender: "MALE", city: "Karachi", intention: "FRIENDSHIP", education: "Doctor", bio: "Long shifts, but always down for a late-night food run.", photo: "https://images.unsplash.com/photo-1618077360395-f3068be8e001?w=600&h=800&fit=crop" },
];

async function main() {
  await prisma.user.upsert({
    where: { phone: "+923009999999" },
    update: { adminRole: "SUPER_ADMIN" },
    create: { phone: "+923009999999", phoneVerified: true, verificationStatus: "PHONE_VERIFIED", adminRole: "SUPER_ADMIN" },
  });
  console.log("Seeded super-admin: +923009999999 (verify via OTP as normal, then it already has admin rights)");

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
        // Real user-created profiles still default to blurred (see
        // routes/profile.js / schema default) — this only overrides it here.
        blurPhotosDefault: false,
      },
    });

    const existingPhoto = await prisma.photo.findFirst({ where: { profileId: profile.id } });
    if (!existingPhoto) {
      await prisma.photo.create({
        data: {
          profileId: profile.id,
          url: u.photo,
          order: 0,
          isPrimary: true,
          moderationStatus: "PASSED",
        },
      });
    }
  }
  console.log(`Seeded ${SEED_USERS.length} demo profiles with photos.`);

  // --- Optional: make every seed profile "like" a real account back, so
  // swiping right on any of them instantly produces a match — useful for
  // demoing Matches/Chat without waiting on a bot to reciprocate, which
  // obviously can't happen on its own since these are static accounts.
  //
  // Usage: AUTO_LIKE_PHONE=+923001234567 npm run seed
  // (use the phone number, or AUTO_LIKE_EMAIL=you@example.com if you signed
  // up via email instead)
  const targetPhone = process.env.AUTO_LIKE_PHONE;
  const targetEmail = process.env.AUTO_LIKE_EMAIL;
  if (targetPhone || targetEmail) {
    const targetUser = await prisma.user.findUnique({
      where: targetPhone ? { phone: targetPhone } : { email: targetEmail },
    });
    if (!targetUser) {
      console.warn(`AUTO_LIKE target (${targetPhone || targetEmail}) not found — sign up/verify first, then re-run seed.`);
    } else {
      for (const actorId of seededUserIds) {
        await prisma.matchAction.upsert({
          where: { actorId_targetId: { actorId, targetId: targetUser.id } },
          update: { action: "LIKE" },
          create: { actorId, targetId: targetUser.id, action: "LIKE" },
        });
      }
      console.log(`All ${seededUserIds.length} seed profiles now like ${targetPhone || targetEmail} back — swipe right on any of them for an instant match.`);
    }
  } else {
    console.log("Tip: re-run with AUTO_LIKE_PHONE=<your phone> (or AUTO_LIKE_EMAIL=<your email>) to make seed profiles like you back instantly, so swiping right produces real matches to test chat with.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
