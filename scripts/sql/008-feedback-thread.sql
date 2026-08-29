-- Turns feedback into a conversation. Expand step.
--
-- 007 gave Feedback a single `reply` column, which made the status page a dead
-- end: the sender could read an answer and had no way to respond to it except
-- by opening a second, unrelated report. Replies now live in their own table
-- and either side can add one.
--
-- Additive only, and safe to run twice. The `reply` and `repliedAt` columns
-- are deliberately left in place: the currently deployed code still reads them,
-- and dropping them here would break the running site for as long as the
-- deploy takes. 009 removes them once the new code is live.
--
-- Wrapped in a transaction because it copies data. If any statement fails,
-- nothing is half-done.

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

-- Carry existing replies across. Guarded on the column still existing so this
-- is safe to run after 009, and on the thread being empty so running it twice
-- does not duplicate them.
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
      WHERE f."reply" IS NOT NULL
        AND btrim(f."reply") <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "FeedbackMessage" m WHERE m."feedbackId" = f."id"
        )
    $mig$;
  END IF;
END $$;

COMMIT;
