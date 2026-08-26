-- Reporting and blocking.
--
-- Written by hand rather than taken from `prisma migrate diff`. That diff also
-- proposed dropping four indexes (Photo_published_cameraId_idx,
-- Photo_published_filmStockId_idx, FilmStock_process_idx,
-- FilmStock_colorBalance_idx) and altering FilmStock.process, none of which
-- belong to this change — they are pre-existing drift between the schema file
-- and the live database, and dropping indexes the feed queries use would have
-- been a quiet performance regression shipped under a feature migration.
--
-- Additive only, and safe to run twice.

CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'NOT_FILM', 'INAPPROPRIATE', 'HARASSMENT', 'COPYRIGHT', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE IF NOT EXISTS "Report" (
    "id"           TEXT NOT NULL,
    "targetType"   TEXT NOT NULL,
    "targetId"     TEXT NOT NULL,
    "reason"       "ReportReason" NOT NULL,
    "detail"       TEXT,
    "status"       "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reporterId"   TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt"   TIMESTAMP(3),
    "reviewNote"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Block" (
    "id"        TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "Report_reporterId_targetType_targetId_key"
  ON "Report"("reporterId", "targetType", "targetId");

CREATE INDEX IF NOT EXISTS "Block_blockerId_idx" ON "Block"("blockerId");
CREATE INDEX IF NOT EXISTS "Block_blockedId_idx" ON "Block"("blockedId");
CREATE UNIQUE INDEX IF NOT EXISTS "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_reporterId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Block" DROP CONSTRAINT IF EXISTS "Block_blockerId_fkey";
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey"
  FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Block" DROP CONSTRAINT IF EXISTS "Block_blockedId_fkey";
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey"
  FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
