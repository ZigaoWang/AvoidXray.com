-- CreateEnum
CREATE TYPE "ExportScope" AS ENUM ('library', 'roll', 'album', 'selection');

-- CreateEnum
CREATE TYPE "ExportState" AS ENUM ('queued', 'building', 'ready', 'failed', 'expired');

-- CreateTable
CREATE TABLE "LibraryExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "ExportScope" NOT NULL,
    "scopeId" TEXT,
    "title" TEXT NOT NULL,
    "photoIds" TEXT[],
    "state" "ExportState" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "parts" JSONB,
    "bytes" BIGINT,
    "bytesRead" BIGINT NOT NULL DEFAULT 0,
    "bytesWritten" BIGINT NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryExport_userId_createdAt_idx" ON "LibraryExport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryExport_state_updatedAt_idx" ON "LibraryExport"("state", "updatedAt");

-- AddForeignKey
ALTER TABLE "LibraryExport" ADD CONSTRAINT "LibraryExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
