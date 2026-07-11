-- CreateTable
CREATE TABLE "CommunityNote" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityNote_targetType_targetId_idx" ON "CommunityNote"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "CommunityNote_userId_idx" ON "CommunityNote"("userId");

-- CreateIndex
CREATE INDEX "CommunityNote_createdAt_idx" ON "CommunityNote"("createdAt");

-- CreateIndex
CREATE INDEX "NoteVote_noteId_idx" ON "NoteVote"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteVote_userId_noteId_key" ON "NoteVote"("userId", "noteId");

-- AddForeignKey
ALTER TABLE "CommunityNote" ADD CONSTRAINT "CommunityNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVote" ADD CONSTRAINT "NoteVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVote" ADD CONSTRAINT "NoteVote_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CommunityNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
