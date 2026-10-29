-- CreateEnum
CREATE TYPE "PublishChoice" AS ENUM ('private', 'all', 'chosen');

-- CreateEnum
CREATE TYPE "ImportItemState" AS ENUM ('uploading', 'uploaded', 'processing', 'done', 'failed');

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publishChoice" "PublishChoice",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rollId" TEXT,
    "rollPosition" INTEGER,
    "filename" TEXT NOT NULL,
    "folder" TEXT,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "imageSha256" TEXT,
    "originalKey" TEXT NOT NULL,
    "multipartUploadId" TEXT,
    "partSize" INTEGER NOT NULL,
    "state" "ImportItemState" NOT NULL DEFAULT 'uploading',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "publish" BOOLEAN NOT NULL DEFAULT false,
    "photoId" TEXT,
    "lookalikeOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Import_userId_createdAt_idx" ON "Import"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItem_originalKey_key" ON "ImportItem"("originalKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItem_photoId_key" ON "ImportItem"("photoId");

-- CreateIndex
CREATE INDEX "ImportItem_importId_idx" ON "ImportItem"("importId");

-- CreateIndex
CREATE INDEX "ImportItem_state_updatedAt_idx" ON "ImportItem"("state", "updatedAt");

-- CreateIndex
CREATE INDEX "ImportItem_userId_sha256_idx" ON "ImportItem"("userId", "sha256");

-- CreateIndex
CREATE INDEX "ImportItem_rollId_idx" ON "ImportItem"("rollId");

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_rollId_fkey" FOREIGN KEY ("rollId") REFERENCES "Roll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written below: see docs/db-objects.md.

ALTER TABLE "ImportItem"
  ADD CONSTRAINT "ImportItem_bytes_positive" CHECK ("bytes" > 0),
  ADD CONSTRAINT "ImportItem_part_size_positive" CHECK ("partSize" > 0),
  ADD CONSTRAINT "ImportItem_position_needs_roll" CHECK ("rollPosition" IS NULL OR "rollId" IS NOT NULL),
  ADD CONSTRAINT "ImportItem_done_has_photo" CHECK ("state" <> 'done' OR "photoId" IS NOT NULL);

-- One file uploads once per owner at a time: registering it again while it
-- is still on its way resumes that upload instead of starting a second one.
CREATE UNIQUE INDEX "ImportItem_one_active_per_file"
  ON "ImportItem"("userId", "sha256")
  WHERE "state" IN ('uploading', 'uploaded', 'processing');

-- An item can only be put in a roll its owner owns.
CREATE FUNCTION "importitem_roll_same_owner"() RETURNS trigger AS $$
BEGIN
  IF NEW."rollId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Roll" WHERE "id" = NEW."rollId" AND "ownerId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'ImportItem_roll_same_owner: roll % is not owned by %', NEW."rollId", NEW."userId"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."rollId" IS NULL THEN
    NEW."rollPosition" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ImportItem_roll_same_owner"
  BEFORE INSERT OR UPDATE OF "rollId", "userId" ON "ImportItem"
  FOR EACH ROW EXECUTE FUNCTION "importitem_roll_same_owner"();
