-- CreateTable
CREATE TABLE "AdminUploadAudit" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rollIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUploadAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUploadAudit_importId_key" ON "AdminUploadAudit"("importId");

-- CreateIndex
CREATE INDEX "AdminUploadAudit_createdAt_idx" ON "AdminUploadAudit"("createdAt");
