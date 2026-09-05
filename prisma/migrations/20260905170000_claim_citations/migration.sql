-- Citations survive on the record, attached to the words they support.
--
-- Provenance held one URL per field, so the claim-level detail a revision
-- carries was lost the moment it was applied. That put the catalogue back where
-- it started one step later: a description with a datasheet fact and a lab's
-- characterisation ended up with a single source covering both.
--
-- Worse, it made an edit unsafe. A citation attached to a field rather than to
-- a sentence keeps covering that field after somebody rewrites it, so a
-- manufacturer citation can end up standing behind words the manufacturer never
-- published. That is the same failure as citing a page that does not contain
-- the claim, arriving through the revision path instead of the writing path.
--
-- Each claim now records the text it supports. When a later edit changes the
-- text, a claim whose words are no longer present is dropped rather than
-- carried, and the reviewer is told which citations were lost.

ALTER TABLE "FieldProvenance" ADD COLUMN "claims" JSONB;

COMMENT ON COLUMN "FieldProvenance"."claims" IS
  'Array of {claim, url?, editorial?}. The claim is the opening words of the passage a citation supports, used to detect when an edit has moved out from under it.';
