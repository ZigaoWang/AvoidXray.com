-- CreateTable
CREATE TABLE "StorageLimitChange" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldBytes" BIGINT,
    "newBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageLimitChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageLimitChange_createdAt_idx" ON "StorageLimitChange"("createdAt");

-- CreateIndex
CREATE INDEX "StorageLimitChange_userId_createdAt_idx" ON "StorageLimitChange"("userId", "createdAt");
