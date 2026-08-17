-- Dosti — pivot from matrimonial/guardian-mode app to general dating app
-- Drops guardian mode and CNIC/ID verification entirely, simplifies the
-- Intention and VerificationStatus enums, and removes the now-unused
-- sect/religiosity/family-background profile fields.

-- ============================================================
-- Drop guardian mode and ID verification entirely
-- ============================================================

DROP TABLE IF EXISTS "GuardianLink";
DROP TABLE IF EXISTS "IdVerification";

-- ============================================================
-- User: drop cnicHash (no longer collected)
-- ============================================================

ALTER TABLE "User" DROP COLUMN IF EXISTS "cnicHash";

-- ============================================================
-- VerificationStatus: UNVERIFIED / PHONE_VERIFIED only.
-- Anyone previously ID_PENDING / ID_VERIFIED / REJECTED collapses to
-- PHONE_VERIFIED — they'd already passed phone verification to get there,
-- and ID verification no longer exists as a concept.
-- ============================================================

CREATE TYPE "VerificationStatus_new" AS ENUM ('UNVERIFIED', 'PHONE_VERIFIED');

ALTER TABLE "User" ALTER COLUMN "verificationStatus" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "verificationStatus" TYPE "VerificationStatus_new"
  USING (
    CASE "verificationStatus"::text
      WHEN 'UNVERIFIED' THEN 'UNVERIFIED'
      ELSE 'PHONE_VERIFIED'
    END
  )::"VerificationStatus_new";
ALTER TABLE "User" ALTER COLUMN "verificationStatus" SET DEFAULT 'UNVERIFIED';

DROP TYPE "VerificationStatus";
ALTER TYPE "VerificationStatus_new" RENAME TO "VerificationStatus";

-- ============================================================
-- Intention: DATING / FRIENDSHIP only.
-- MARRIAGE and SERIOUS_RELATIONSHIP both collapse to DATING.
-- ============================================================

CREATE TYPE "Intention_new" AS ENUM ('DATING', 'FRIENDSHIP');

ALTER TABLE "Profile" ALTER COLUMN "intention" TYPE "Intention_new"
  USING (
    CASE "intention"::text
      WHEN 'FRIENDSHIP' THEN 'FRIENDSHIP'
      ELSE 'DATING'
    END
  )::"Intention_new";

DROP TYPE "Intention";
ALTER TYPE "Intention_new" RENAME TO "Intention";

-- ============================================================
-- Profile: drop matrimonial-specific fields
-- ============================================================

ALTER TABLE "Profile" DROP COLUMN IF EXISTS "sect";
ALTER TABLE "Profile" DROP COLUMN IF EXISTS "religiosityLevel";
ALTER TABLE "Profile" DROP COLUMN IF EXISTS "familyBackground";
ALTER TABLE "Profile" DROP COLUMN IF EXISTS "showFamilyBackground";
ALTER TABLE "Profile" DROP COLUMN IF EXISTS "guardianModeOn";
