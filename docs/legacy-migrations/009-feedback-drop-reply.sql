-- Turns feedback into a conversation. Contract step.
--
-- Run only after 008 has copied the replies into "FeedbackMessage" and the
-- code that reads these columns is no longer deployed. Splitting the drop out
-- of 008 is what makes the change deployable without a broken window: the old
-- code needs these columns until the moment it stops running, and the new code
-- never reads them.
--
-- Refuses to run if 008 has not carried the data across, so the columns cannot
-- be dropped while they are still the only copy.

DO $$
DECLARE
  unmigrated INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Feedback' AND column_name = 'reply'
  ) THEN
    SELECT count(*) INTO unmigrated
    FROM "Feedback" f
    WHERE f."reply" IS NOT NULL
      AND btrim(f."reply") <> ''
      AND NOT EXISTS (SELECT 1 FROM "FeedbackMessage" m WHERE m."feedbackId" = f."id");

    IF unmigrated > 0 THEN
      RAISE EXCEPTION
        'Refusing to drop reply: % row(s) not carried into FeedbackMessage. Run 008 first.',
        unmigrated;
    END IF;
  END IF;
END $$;

ALTER TABLE "Feedback" DROP COLUMN IF EXISTS "reply";
ALTER TABLE "Feedback" DROP COLUMN IF EXISTS "repliedAt";
