-- Slugs a film stock or camera used to carry.
--
-- A slug is derived from the name, so renaming a record changes its URL. The
-- resolver looks slugs up by exact match, so without a record of the previous
-- one every existing link to that page would 404 rather than redirect.
--
-- kind is part of the primary key because /films and /cameras are separate
-- namespaces and the same slug may be retired in both.
--
-- Additive only, and safe to run twice.

CREATE TABLE IF NOT EXISTS "SlugHistory" (
  "kind"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "targetId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SlugHistory_pkey" PRIMARY KEY ("kind", "slug")
);

CREATE INDEX IF NOT EXISTS "SlugHistory_kind_targetId_idx"
  ON "SlugHistory" ("kind", "targetId");
