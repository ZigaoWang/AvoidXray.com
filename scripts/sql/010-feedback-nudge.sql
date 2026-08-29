-- Lets the sender ask for a reminder when a thread has gone quiet.
--
-- The timestamp lives on the row rather than in the browser so the cooldown
-- cannot be reset by clearing site data, and so it survives across devices.
--
-- Additive only, and safe to run twice.

ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "lastNudgeAt" TIMESTAMP(3);
