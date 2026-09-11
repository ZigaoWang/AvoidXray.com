-- Deleting an account should not be blocked by the work it reviewed.
--
-- Both tables point at the reviewer with onDelete: SetNull, and both carried a
-- biconditional CHECK saying the timestamp and the person are present or absent
-- together. So the moment an account that had reviewed anything was deleted,
-- Postgres nulled the reviewer, the CHECK failed, and the whole delete was
-- refused: "violates check constraint FieldProvenance_verified_has_verifier".
-- Admin user deletion could not remove any moderator who had ever worked.
--
-- What the rule was really for is kept: a record cannot name a reviewer without
-- saying when, and a decided revision still has to carry its timestamp. What is
-- dropped is the claim that a timestamp implies a surviving account — the
-- review happened, and a deleted account does not unmake it.

ALTER TABLE "Revision" DROP CONSTRAINT "Revision_reviewed_has_reviewer";

ALTER TABLE "Revision" ADD CONSTRAINT "Revision_reviewer_has_time"
  CHECK ("reviewedById" IS NULL OR "reviewedAt" IS NOT NULL);

-- Kept from the old biconditional: anything that is no longer pending was
-- decided at a knowable moment. Pairs with Revision_pending_has_no_outcome,
-- which already forbids the reverse.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_decided_has_time"
  CHECK ("status" = 'PENDING' OR "reviewedAt" IS NOT NULL);

ALTER TABLE "FieldProvenance" DROP CONSTRAINT "FieldProvenance_verified_has_verifier";

ALTER TABLE "FieldProvenance" ADD CONSTRAINT "FieldProvenance_verifier_has_time"
  CHECK ("verifiedById" IS NULL OR "verifiedAt" IS NOT NULL);
