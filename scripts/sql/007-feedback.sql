-- Site feedback: bugs, ideas and questions sent from the footer form.
--
-- Written by hand for the same reason as 006: `prisma migrate diff` still
-- proposes unrelated index drops that are pre-existing drift between the
-- schema file and the live database, and shipping those under a feature
-- migration would be a quiet performance regression.
--
-- Additive only, and safe to run twice.

DO $$ BEGIN
  CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'IDEA', 'QUESTION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'PLANNED', 'FIXED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Feedback" (
    "id"        TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind"      "FeedbackKind" NOT NULL,
    "message"   TEXT NOT NULL,
    "email"     TEXT,
    "userId"    TEXT,
    "pageUrl"   TEXT,
    "userAgent" TEXT,
    "status"    "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "reply"     TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- The reference is the capability that lets a signed-out reporter read their
-- own status page, so it has to be unique rather than merely indexed.
CREATE UNIQUE INDEX IF NOT EXISTS "Feedback_reference_key" ON "Feedback"("reference");
CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_userId_idx" ON "Feedback"("userId");

-- SET NULL, not CASCADE: someone deleting their account should not delete the
-- bug report that is the only record of a fault, and the message stands on its
-- own without an author.
ALTER TABLE "Feedback" DROP CONSTRAINT IF EXISTS "Feedback_userId_fkey";
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
