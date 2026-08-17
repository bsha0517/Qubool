-- Dosti — add email/password auth support
-- Makes "phone" optional (accounts can now exist via email+password only)
-- and adds "emailVerified" to mirror the existing "phoneVerified" flag.

ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_email_idx" ON "User"("email");
