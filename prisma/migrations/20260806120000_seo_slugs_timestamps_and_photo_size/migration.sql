-- Reconciles the migration history with schema.prisma.
--
-- These columns were applied to production by hand (scripts/sql/001 and 002)
-- before this migration existed, because the pre-Postgres migrations in this
-- folder could not be replayed. This file exists so `prisma migrate dev` no
-- longer sees drift and offer to reset the database, and so a fresh database
-- built from the migration history matches the deployed schema.
--
-- On the existing production database this migration is recorded as applied
-- without running (`prisma migrate resolve --applied`). Every statement is
-- idempotent regardless, so replaying it is harmless.

-- Keyword-bearing hub URLs: /films/kodak-gold-200 rather than a cuid.
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Camera"    ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "FilmStock_slug_key" ON "FilmStock"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Camera_slug_key"    ON "Camera"("slug");

-- Real change timestamps, so sitemap <lastmod> carries meaning. Emitting build
-- time for every URL teaches Google to ignore the field.
ALTER TABLE "Photo"     ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Camera"    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Camera"    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Seed existing photos from their upload date rather than "now", so the first
-- sitemap after deploy does not claim every photo changed simultaneously.
UPDATE "Photo" SET "updatedAt" = "createdAt" WHERE "updatedAt" > "createdAt";

-- Byte size of the stored original, recorded at upload so the photo page does
-- not need a blocking HeadObject against object storage on every render.
ALTER TABLE "Photo" ADD COLUMN IF NOT EXISTS "originalBytes" INTEGER;

-- Hub pages and the sitemap both filter published photos by film/camera.
CREATE INDEX IF NOT EXISTS "Photo_published_filmStockId_idx" ON "Photo"("published", "filmStockId");
CREATE INDEX IF NOT EXISTS "Photo_published_cameraId_idx"    ON "Photo"("published", "cameraId");
