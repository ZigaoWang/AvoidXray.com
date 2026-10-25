-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('community', 'archive');

-- CreateEnum
CREATE TYPE "FilmTagSource" AS ENUM ('stated_by_archive', 'inferred', 'unknown');

-- AlterTable. Every existing row is a community upload, which the default fills in.
ALTER TABLE "Photo" ADD COLUMN     "kind" "PhotoKind" NOT NULL DEFAULT 'community',
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ArchiveSource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "creditLine" TEXT NOT NULL,

    CONSTRAINT "ArchiveSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveRecord" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHandleUrl" TEXT,
    "sourceMasterUrl" TEXT NOT NULL,
    "sourceMasterBytes" BIGINT NOT NULL,
    "sourceMasterSha256" TEXT NOT NULL,
    "photographer" TEXT,
    "takenAt" TEXT,
    "originalTitle" TEXT,
    "medium" TEXT,
    "notes" TEXT,
    "rightsNote" TEXT,
    "filmTagSource" "FilmTagSource" NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveSource_slug_key" ON "ArchiveSource"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveRecord_photoId_key" ON "ArchiveRecord"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveRecord_sourceId_externalId_key" ON "ArchiveRecord"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "Photo_kind_idx" ON "Photo"("kind");

-- AddForeignKey
ALTER TABLE "ArchiveRecord" ADD CONSTRAINT "ArchiveRecord_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveRecord" ADD CONSTRAINT "ArchiveRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ArchiveSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A community photo has an uploader and an archive photo has none. Making
-- userId nullable without this would let a community row lose its owner.
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_owner_matches_kind"
  CHECK (("kind" = 'community') = ("userId" IS NOT NULL));
