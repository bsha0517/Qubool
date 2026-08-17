-- Dosti — discovery filters + profile prompts
-- Adds preferredGender/ageMin/ageMax/sameCityOnly to Profile for discovery
-- filtering, and a new ProfilePrompt table for Tinder-style conversation
-- starters. Multiple photos per profile were already supported by the
-- existing Photo table (order field) — no schema change needed for that
-- part, just new application code.

CREATE TYPE "GenderPreference" AS ENUM ('MALE', 'FEMALE', 'ANY');

ALTER TABLE "Profile" ADD COLUMN "preferredGender" "GenderPreference" NOT NULL DEFAULT 'ANY';
ALTER TABLE "Profile" ADD COLUMN "ageMin" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "Profile" ADD COLUMN "ageMax" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Profile" ADD COLUMN "sameCityOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProfilePrompt" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" VARCHAR(300) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfilePrompt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfilePrompt_profileId_idx" ON "ProfilePrompt"("profileId");

ALTER TABLE "ProfilePrompt" ADD CONSTRAINT "ProfilePrompt_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
