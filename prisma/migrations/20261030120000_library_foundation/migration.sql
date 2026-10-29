-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('month', 'day');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'LAB';

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "derivativeBytes" INTEGER,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "imageSha256" TEXT,
ADD COLUMN     "imagesPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "labId" TEXT,
ADD COLUMN     "largeKey" TEXT,
ADD COLUMN     "largePath" TEXT,
ADD COLUMN     "mediumKey" TEXT,
ADD COLUMN     "originalKey" TEXT,
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "originalSha256" TEXT,
ADD COLUMN     "perceptualHash" TEXT,
ADD COLUMN     "rollId" TEXT,
ADD COLUMN     "rollPosition" INTEGER,
ADD COLUMN     "scannerModel" TEXT,
ADD COLUMN     "thumbKey" TEXT,
ADD COLUMN     "uploadComplete" BOOLEAN NOT NULL DEFAULT false;


-- ── Existing rows ─────────────────────────────────────────────────────────
--
-- `published` becomes `uploadComplete`. The old column stays for now, kept in
-- step by Photo_published_mirror below: deploy applies migrations before it
-- builds, so the previous build serves against this schema for the length of
-- the build, and the archive import runs as its own long-lived process. Both
-- read and write `published`. A later migration drops it.
UPDATE "Photo" SET "uploadComplete" = "published";

-- Keys from the stored URLs. Every URL is the bucket's own address or, in a
-- development checkout, /local-uploads/, followed by the key.
UPDATE "Photo" SET
  "thumbKey"  = regexp_replace("thumbnailPath", '^(https?://[^/]+/|/local-uploads/)', ''),
  "mediumKey" = regexp_replace("mediumPath",    '^(https?://[^/]+/|/local-uploads/)', '');
UPDATE "Photo" SET "originalKey" = regexp_replace("originalPath", '^(https?://[^/]+/|/local-uploads/)', '')
  WHERE "kind" = 'community';
-- An archive photo keeps no original; what it stores as originalPath is its
-- 4000px display version, which is exactly what largePath means.
UPDATE "Photo" SET
  "largeKey"  = regexp_replace("originalPath", '^(https?://[^/]+/|/local-uploads/)', ''),
  "largePath" = "originalPath"
  WHERE "kind" = 'archive';

ALTER TABLE "Photo" ALTER COLUMN "thumbKey" SET NOT NULL, ALTER COLUMN "mediumKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "storageLimitBytes" BIGINT;

-- CreateTable
CREATE TABLE "Roll" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT,
    "filmStockId" TEXT,
    "cameraId" TEXT,
    "labId" TEXT,
    "scannerModel" TEXT,
    "shotFrom" DATE,
    "shotFromPrecision" "DatePrecision",
    "shotTo" DATE,
    "shotToPrecision" "DatePrecision",
    "developedAt" DATE,
    "developedAtPrecision" "DatePrecision",
    "location" TEXT,
    "ei" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Roll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT,
    "country" TEXT,
    "website" TEXT,
    "description" TEXT,
    "addedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Roll_ownerId_createdAt_idx" ON "Roll"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Roll_filmStockId_idx" ON "Roll"("filmStockId");

-- CreateIndex
CREATE INDEX "Roll_cameraId_idx" ON "Roll"("cameraId");

-- CreateIndex
CREATE INDEX "Roll_labId_idx" ON "Roll"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "Lab_slug_key" ON "Lab"("slug");

-- CreateIndex
CREATE INDEX "Lab_name_idx" ON "Lab"("name");

-- CreateIndex
CREATE INDEX "Photo_uploadComplete_createdAt_idx" ON "Photo"("uploadComplete", "createdAt");

-- CreateIndex
CREATE INDEX "Photo_uploadComplete_visibility_createdAt_idx" ON "Photo"("uploadComplete", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Photo_uploadComplete_cameraId_idx" ON "Photo"("uploadComplete", "cameraId");

-- CreateIndex
CREATE INDEX "Photo_uploadComplete_filmStockId_idx" ON "Photo"("uploadComplete", "filmStockId");

-- CreateIndex
CREATE INDEX "Photo_labId_idx" ON "Photo"("labId");

-- CreateIndex
CREATE INDEX "Photo_rollId_rollPosition_idx" ON "Photo"("rollId", "rollPosition");

-- CreateIndex
CREATE INDEX "Photo_userId_imageSha256_idx" ON "Photo"("userId", "imageSha256");

-- CreateIndex
CREATE INDEX "Photo_userId_originalSha256_idx" ON "Photo"("userId", "originalSha256");

-- CreateIndex
CREATE INDEX "Photo_visibility_imagesPublic_idx" ON "Photo"("visibility", "imagesPublic");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_rollId_fkey" FOREIGN KEY ("rollId") REFERENCES "Roll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_filmStockId_fkey" FOREIGN KEY ("filmStockId") REFERENCES "FilmStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The published indexes go once their replacements exist.
DROP INDEX "Photo_published_cameraId_idx";
DROP INDEX "Photo_published_createdAt_idx";
DROP INDEX "Photo_published_filmStockId_idx";
DROP INDEX "Photo_published_visibility_createdAt_idx";

-- ── CHECK constraints ─────────────────────────────────────────────────────

-- Every community photo has an original in storage; an archive photo has none.
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_original_matches_kind"
  CHECK (("kind" = 'community') = ("originalKey" IS NOT NULL));

-- A frame number means something only inside a roll.
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_position_needs_roll"
  CHECK ("rollPosition" IS NULL OR "rollId" IS NOT NULL);

-- A date and its precision come together. A month-only date is stored as the
-- 1st, so two rolls from the same month compare equal rather than by whatever
-- day was made up for them.
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_shot_from_has_precision"
  CHECK (("shotFrom" IS NULL) = ("shotFromPrecision" IS NULL)
     AND ("shotFromPrecision" IS DISTINCT FROM 'month' OR EXTRACT(DAY FROM "shotFrom") = 1));
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_shot_to_has_precision"
  CHECK (("shotTo" IS NULL) = ("shotToPrecision" IS NULL)
     AND ("shotToPrecision" IS DISTINCT FROM 'month' OR EXTRACT(DAY FROM "shotTo") = 1));
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_developed_has_precision"
  CHECK (("developedAt" IS NULL) = ("developedAtPrecision" IS NULL)
     AND ("developedAtPrecision" IS DISTINCT FROM 'month' OR EXTRACT(DAY FROM "developedAt") = 1));
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_shot_range_in_order"
  CHECK ("shotFrom" IS NULL OR "shotTo" IS NULL OR "shotTo" >= "shotFrom");
ALTER TABLE "Roll" ADD CONSTRAINT "Roll_ei_positive"
  CHECK ("ei" IS NULL OR "ei" > 0);

-- ── Triggers ──────────────────────────────────────────────────────────────

-- Transitional, with Photo_keys_from_paths: both exist only so code built
-- before this migration keeps working until the next deploy, and both are
-- dropped with the `published` column.
CREATE FUNCTION photo_published_mirror() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."uploadComplete" := NEW."uploadComplete" OR NEW."published";
  ELSIF NEW."published" IS DISTINCT FROM OLD."published"
    AND NEW."uploadComplete" IS NOT DISTINCT FROM OLD."uploadComplete" THEN
    -- Written through the old name.
    NEW."uploadComplete" := NEW."published";
  END IF;
  NEW."published" := NEW."uploadComplete";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Photo_published_mirror" BEFORE INSERT OR UPDATE ON "Photo"
  FOR EACH ROW EXECUTE FUNCTION photo_published_mirror();

-- Older code writes URLs and no keys. A URL that is a bucket or local-uploads
-- address names its key; anything else (the private image route) does not,
-- and leaves the key as written.
CREATE FUNCTION photo_keys_from_paths() RETURNS TRIGGER AS $$
DECLARE
  stored CONSTANT TEXT := '^(https?://[^/]+/|/local-uploads/)';
BEGIN
  IF (TG_OP = 'INSERT' AND NEW."thumbKey" IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW."thumbnailPath" IS DISTINCT FROM OLD."thumbnailPath"
         AND NEW."thumbKey" IS NOT DISTINCT FROM OLD."thumbKey" AND NEW."thumbnailPath" ~ stored) THEN
    NEW."thumbKey" := regexp_replace(NEW."thumbnailPath", stored, '');
  END IF;
  IF (TG_OP = 'INSERT' AND NEW."mediumKey" IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW."mediumPath" IS DISTINCT FROM OLD."mediumPath"
         AND NEW."mediumKey" IS NOT DISTINCT FROM OLD."mediumKey" AND NEW."mediumPath" ~ stored) THEN
    NEW."mediumKey" := regexp_replace(NEW."mediumPath", stored, '');
  END IF;
  IF NEW."kind" = 'community' THEN
    IF (TG_OP = 'INSERT' AND NEW."originalKey" IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW."originalPath" IS DISTINCT FROM OLD."originalPath"
           AND NEW."originalKey" IS NOT DISTINCT FROM OLD."originalKey" AND NEW."originalPath" ~ stored) THEN
      NEW."originalKey" := regexp_replace(NEW."originalPath", stored, '');
    END IF;
  ELSIF (TG_OP = 'INSERT' AND NEW."largeKey" IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW."originalPath" IS DISTINCT FROM OLD."originalPath"
         AND NEW."largeKey" IS NOT DISTINCT FROM OLD."largeKey") THEN
    NEW."largeKey" := regexp_replace(NEW."originalPath", stored, '');
    NEW."largePath" := NEW."originalPath";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Photo_keys_from_paths" BEFORE INSERT OR UPDATE ON "Photo"
  FOR EACH ROW EXECUTE FUNCTION photo_keys_from_paths();

-- A photo in a roll takes its camera, film stock and lab from the roll. Joining
-- it into the photo is set when a photo joins a roll, and any other attempt to
-- give it different ones is refused rather than quietly overwritten, so a bug
-- that writes them per photo fails where it happens. Leaving a roll keeps what
-- the photo had, which is what a loose photo holding its own details means.
CREATE FUNCTION photo_follows_roll() RETURNS TRIGGER AS $$
DECLARE
  r "Roll"%ROWTYPE;
BEGIN
  IF NEW."rollId" IS NULL THEN
    NEW."rollPosition" := NULL;
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM "Roll" WHERE "id" = NEW."rollId";
  IF r."ownerId" IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'A photo can only be in a roll belonging to its owner'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'Photo_roll_same_owner';
  END IF;
  IF TG_OP = 'INSERT' OR NEW."rollId" IS DISTINCT FROM OLD."rollId" THEN
    NEW."cameraId" := r."cameraId";
    NEW."filmStockId" := r."filmStockId";
    NEW."labId" := r."labId";
  ELSIF NOT (
    -- Deleting a camera, film stock or lab clears it from the photo and from
    -- the roll in two separate referential actions, in no fixed order. So a
    -- photo may drop a value the roll still names once that entry is gone.
        (NEW."cameraId" IS NOT DISTINCT FROM r."cameraId"
         OR (NEW."cameraId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Camera" WHERE "id" = r."cameraId")))
    AND (NEW."filmStockId" IS NOT DISTINCT FROM r."filmStockId"
         OR (NEW."filmStockId" IS NULL AND NOT EXISTS (SELECT 1 FROM "FilmStock" WHERE "id" = r."filmStockId")))
    AND (NEW."labId" IS NOT DISTINCT FROM r."labId"
         OR (NEW."labId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Lab" WHERE "id" = r."labId")))
  ) THEN
    RAISE EXCEPTION 'A photo in a roll takes its camera, film stock and lab from the roll'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'Photo_details_follow_roll';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Photo_follows_roll"
  BEFORE INSERT OR UPDATE OF "rollId", "cameraId", "filmStockId", "labId", "userId" ON "Photo"
  FOR EACH ROW EXECUTE FUNCTION photo_follows_roll();

CREATE FUNCTION roll_details_to_photos() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    RAISE EXCEPTION 'A roll cannot change owner'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'Roll_owner_fixed';
  END IF;
  IF (NEW."cameraId", NEW."filmStockId", NEW."labId") IS DISTINCT FROM (OLD."cameraId", OLD."filmStockId", OLD."labId") THEN
    UPDATE "Photo"
       SET "cameraId" = NEW."cameraId", "filmStockId" = NEW."filmStockId", "labId" = NEW."labId"
     WHERE "rollId" = NEW."id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Roll_details_to_photos" AFTER UPDATE ON "Roll"
  FOR EACH ROW EXECUTE FUNCTION roll_details_to_photos();

-- Labs are a fifth entity type for provenance, cleaned up like the other four.
CREATE TRIGGER "Lab_provenance_cleanup" AFTER DELETE ON "Lab"
  FOR EACH ROW EXECUTE FUNCTION delete_field_provenance('LAB');
