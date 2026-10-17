-- CreateEnum
CREATE TYPE "PhotoScreening" AS ENUM ('pending', 'clear', 'held', 'rejected');

-- Photos already on the site were published before the check existed and
-- stay public. Only rows created from here on start out pending.
ALTER TABLE "Photo" ADD COLUMN "screening" "PhotoScreening" NOT NULL DEFAULT 'clear',
ADD COLUMN "nudityScore" DOUBLE PRECISION;
ALTER TABLE "Photo" ALTER COLUMN "screening" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "PhotoEmbedding" (
    "photoId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vector" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoEmbedding_pkey" PRIMARY KEY ("photoId")
);

-- CreateIndex
CREATE INDEX "Photo_screening_idx" ON "Photo"("screening");

-- CreateIndex
CREATE INDEX "PhotoEmbedding_model_idx" ON "PhotoEmbedding"("model");

-- AddForeignKey
ALTER TABLE "PhotoEmbedding" ADD CONSTRAINT "PhotoEmbedding_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
