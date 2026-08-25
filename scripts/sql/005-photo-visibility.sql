-- Per-photo visibility.
--
-- Albums could already be private, but their photos could not: a photo in a
-- private album still appeared in explore, on the owner's profile, on film and
-- camera pages, in search and in the sitemap. The only way to take one out of
-- public view was to delete it, which removed it everywhere.
--
-- This cannot reuse `published`. That column means "the upload finished", and
-- /api/upload/cleanup deletes unpublished photos an hour after they are
-- created — so anything parked there would be destroyed, not hidden.
--
--   npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/sql/005-photo-visibility.sql
--
-- Every statement is idempotent, so re-running is harmless. Existing photos
-- default to PUBLIC, which is what they already were: this migration changes
-- no photo's visibility.

DO $$ BEGIN
  CREATE TYPE "PhotoVisibility" AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Photo"
  ADD COLUMN IF NOT EXISTS "visibility" "PhotoVisibility" NOT NULL DEFAULT 'public';

-- The feeds filter on published + visibility and order by createdAt, so the
-- composite covers the common query. The single-column index serves the
-- owner-facing "my private photos" lookups.
CREATE INDEX IF NOT EXISTS "Photo_visibility_idx"
  ON "Photo" ("visibility");

CREATE INDEX IF NOT EXISTS "Photo_published_visibility_createdAt_idx"
  ON "Photo" ("published", "visibility", "createdAt");
