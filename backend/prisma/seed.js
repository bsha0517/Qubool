const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SEED_USERS = [
  { phone: "+923001111111", name: "Ayesha", age: 27, gender: "FEMALE", city: "Lahore", intention: "MARRIAGE", sect: "Sunni", education: "MBA, LUMS", bio: "Loves calligraphy and long walks along the canal." },
  { phone: "+923002222222", name: "Hamza", age: 30, gender: "MALE", city: "Karachi", intention: "MARRIAGE", sect: "Sunni", education: "Software Engineer", bio: "Coffee enthusiast, cricket fan, family-oriented." },
  { phone: "+923003333333", name: "Zara", age: 25, gender: "FEMALE", city: "Islamabad", intention: "SERIOUS_RELATIONSHIP", sect: "Shia", education: "Doctor", bio: "Book lover, hiking on weekends." },
  { phone: "+923004444444", name: "Bilal", age: 29, gender: "MALE", city: "Lahore", intention: "MARRIAGE", sect: "Sunni", education: "Architect", bio: "Design-obsessed, plays the tabla badly." },
];

async function main() {
  await prisma.user.upsert({
    where: { phone: "+923009999999" },
    update: { adminRole: "SUPER_ADMIN" },
    create: { phone: "+923009999999", phoneVerified: true, verificationStatus: "PHONE_VERIFIED", adminRole: "SUPER_ADMIN" },
  });
  console.log("Seeded super-admin: +923009999999 (verify via OTP as normal, then it already has admin rights)");

  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: { phone: u.phone, phoneVerified: true, verificationStatus: "PHONE_VERIFIED" },
    });

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: u.name,
        age: u.age,
        gender: u.gender,
        city: u.city,
        intention: u.intention,
        sect: u.sect,
        education: u.education,
        bio: u.bio,
        blurPhotosDefault: true,
      },
    });
  }
  console.log(`Seeded ${SEED_USERS.length} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
