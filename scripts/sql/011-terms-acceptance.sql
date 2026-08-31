-- Records that an account agreed to the terms, and to which wording.
--
-- Nullable on purpose. Accounts that existed before sign-up asked for consent
-- did not agree to anything, and a default would state otherwise. Leaving them
-- null is what makes it possible to tell the two groups apart and to ask the
-- earlier ones later.
--
-- Additive only, and safe to run twice.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
