-- AlterTable
ALTER TABLE "User" ADD COLUMN "libraryBeta" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LibraryBetaChange" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryBetaChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryBetaChange_createdAt_idx" ON "LibraryBetaChange"("createdAt");

-- CreateIndex
CREATE INDEX "LibraryBetaChange_userId_createdAt_idx" ON "LibraryBetaChange"("userId", "createdAt");
