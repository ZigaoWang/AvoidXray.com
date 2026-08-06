-- SEO: slug columns + real timestamps.
--
-- Applied directly rather than through `prisma migrate deploy`, because this
-- repo's migration history predates the move to Postgres (the init migration
-- declares SQLite DATETIME columns and sits in a failed state) and cannot be
-- replayed. Every statement here is idempotent, so re-running is harmless.
--
--   npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/sql/001-seo-slugs-and-timestamps.sql
--   npx tsx scripts/backfill-slugs.ts

-- Keyword-bearing hub URLs: /films/kodak-gold-200 instead of /films/cmjzo30v8...
-- Nullable at first so the ALTER is instant and safe on a live table; the
-- backfill script populates them immediately afterwards.
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Camera"    ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "FilmStock_slug_key" ON "FilmStock"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Camera_slug_key"    ON "Camera"("slug");

-- Real change timestamps so sitemap <lastmod> means something. Google learns to
-- ignore lastmod when every URL claims to have changed at build time.
ALTER TABLE "Photo"     ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Camera"    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Camera"    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Seed existing photos with their upload date rather than "now", so the first
-- sitemap after deploy doesn't claim all 810 photos changed simultaneously.
UPDATE "Photo" SET "updatedAt" = "createdAt" WHERE "updatedAt" > "createdAt";

-- Sitemap and hub pages both filter published photos by film/camera constantly.
CREATE INDEX IF NOT EXISTS "Photo_published_filmStockId_idx" ON "Photo"("published", "filmStockId");
CREATE INDEX IF NOT EXISTS "Photo_published_cameraId_idx"    ON "Photo"("published", "cameraId");
