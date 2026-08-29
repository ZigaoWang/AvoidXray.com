-- Turns feedback into a conversation.
--
-- 007 gave Feedback a single `reply` column, which made the status page a dead
-- end: the sender could read an answer and had no way to respond to it except
-- by opening a second, unrelated report. Replies now live in their own table
-- and either side can add one.
--
-- Wrapped in a transaction because it moves data before dropping the columns
-- that hold it. If any statement fails, nothing is lost.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "FeedbackAuthor" AS ENUM ('SENDER', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FeedbackMessage" (
    "id"         TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "author"     "FeedbackAuthor" NOT NULL,
    "authorId"   TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeedbackMessage_feedbackId_createdAt_idx"
  ON "FeedbackMessage"("feedbackId", "createdAt");

ALTER TABLE "FeedbackMessage" DROP CONSTRAINT IF EXISTS "FeedbackMessage_feedbackId_fkey";
ALTER TABLE "FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_feedbackId_fkey"
  FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing replies across before the columns holding them go away.
-- Guarded on the column still existing so the script is safe to run twice.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Feedback' AND column_name = 'reply'
  ) THEN
    EXECUTE $mig$
      INSERT INTO "FeedbackMessage" ("id", "feedbackId", "body", "author", "createdAt")
      SELECT
        md5(random()::text || clock_timestamp()::text),
        f."id",
        f."reply",
        'STAFF'::"FeedbackAuthor",
        COALESCE(f."repliedAt", f."updatedAt")
      FROM "Feedback" f
      WHERE f."reply" IS NOT NULL AND btrim(f."reply") <> ''
    $mig$;
  END IF;
END $$;

ALTER TABLE "Feedback" DROP COLUMN IF EXISTS "reply";
ALTER TABLE "Feedback" DROP COLUMN IF EXISTS "repliedAt";

COMMIT;
