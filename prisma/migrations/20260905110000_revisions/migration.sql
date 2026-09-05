-- One door for every edit.
--
-- A contributor, an administrator and an automated writer submit the same shape
-- and are told apart by `source`, not by which code path they reached. An
-- administrator's edit is auto-approved in the same transaction, so it costs no
-- extra step, but it still produces a diff, a history and provenance rows.
--
-- The immediate admin path skipped provenance within days of provenance
-- existing, because nothing forced the two to stay in step. The review screen
-- built for automated proposals is the review screen, and the path used daily
-- should not be the one with no history.
--
-- ModerationSubmission is left in place and untouched. It is made read-only in
-- the application the moment this ships, so nothing new lands in it, and it is
-- dropped in a later contract migration once its remaining items are resolved.
-- The deletion date is recorded in docs/db-objects.md.

CREATE TYPE "RevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PARTIAL');

-- Optimistic concurrency. A draft made against an older version can be spotted
-- instead of silently overwriting what changed underneath it.
ALTER TABLE "FilmStock" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Camera"    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Brand"     ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "Revision" (
  "id"             TEXT NOT NULL,
  "entityType"     "EntityType" NOT NULL,
  "entityId"       TEXT,
  "baseVersion"    INTEGER,
  "payload"        JSONB NOT NULL,
  "sourceUrls"     JSONB NOT NULL DEFAULT '{}',
  "source"         "ValueSource" NOT NULL,
  "submittedById"  TEXT,
  "submittedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"         "RevisionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "appliedFields"  JSONB,
  "rejectedFields" JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Revision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Revision_submittedById_fkey" FOREIGN KEY ("submittedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Revision_reviewedById_fkey" FOREIGN KEY ("reviewedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Revision_status_entityType_idx"  ON "Revision"("status", "entityType");
CREATE INDEX "Revision_entityType_entityId_idx" ON "Revision"("entityType", "entityId");

-- The queue, as an index. Every question asked of this table on the review
-- screen is "what is waiting", so the index covers only those rows.
CREATE INDEX "Revision_pending_idx" ON "Revision"("entityType", "submittedAt")
  WHERE "status" = 'PENDING';

-- A reviewed revision records who reviewed it, and an unreviewed one cannot
-- claim a reviewer. Same rule the provenance table carries.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_reviewed_has_reviewer"
  CHECK (("reviewedAt" IS NULL) = ("reviewedById" IS NULL));

-- Pending means nothing has been decided yet, so it cannot carry an outcome.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_pending_has_no_outcome"
  CHECK (
    "status" <> 'PENDING'
    OR ("reviewedAt" IS NULL AND "appliedFields" IS NULL AND "rejectedFields" IS NULL)
  );

-- A settled revision has been reviewed. Without this a row can report an
-- outcome nobody is accountable for.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_settled_is_reviewed"
  CHECK ("status" = 'PENDING' OR "reviewedAt" IS NOT NULL);

-- A partial approval means exactly that: something landed and something did
-- not. Recorded as an event with a reason, and deliberately not as a standing
-- judgement, so the same value can be proposed again with a citation attached.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_partial_has_both_outcomes"
  CHECK (
    "status" <> 'PARTIAL'
    OR ("appliedFields" IS NOT NULL AND "rejectedFields" IS NOT NULL)
  );

-- An edit has to change something.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_payload_is_not_empty"
  CHECK (jsonb_typeof("payload") = 'object' AND "payload" <> '{}'::jsonb);

-- A generated proposal cites every field it proposes.
--
-- Enforced here rather than asked of the prompt, because a prompt is not a
-- constraint. Through a function because a CHECK cannot contain a subquery and
-- comparing two key sets needs one. The function is IMMUTABLE and reads only
-- its arguments, which is what makes it legal in a constraint.
CREATE OR REPLACE FUNCTION revision_every_field_is_cited(payload JSONB, source_urls JSONB)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(payload) AS k
    WHERE NOT (source_urls ? k)
  );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE "Revision" ADD CONSTRAINT "Revision_generated_values_are_cited"
  CHECK ("source" <> 'LLM' OR revision_every_field_is_cited("payload", "sourceUrls"));
