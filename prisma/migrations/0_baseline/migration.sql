-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ColorBalance" AS ENUM ('Daylight', 'Tungsten', 'N/A');

-- CreateEnum
CREATE TYPE "public"."FeedbackAuthor" AS ENUM ('SENDER', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."FeedbackKind" AS ENUM ('BUG', 'IDEA', 'QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."FeedbackStatus" AS ENUM ('OPEN', 'PLANNED', 'FIXED', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."FilmProcess" AS ENUM ('C-41', 'E-6', 'ECN-2', 'B&W', 'Other');

-- CreateEnum
CREATE TYPE "public"."PhotoVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('SPAM', 'NOT_FILM', 'INAPPROPRIATE', 'HARASSMENT', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "public"."Block" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Camera" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "userId" TEXT NOT NULL,
    "description" TEXT,
    "imageStatus" TEXT NOT NULL DEFAULT 'none',
    "imageUploadedAt" TIMESTAMP(3),
    "imageUploadedBy" TEXT,
    "imageUrl" TEXT,
    "cameraType" TEXT,
    "format" TEXT,
    "mountType" TEXT,
    "year" INTEGER,
    "defaultFilmStockId" TEXT,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "public" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CollectionPhoto" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Comment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunityNote" (
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
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "public"."FeedbackKind" NOT NULL,
    "message" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "status" "public"."FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastNudgeAt" TIMESTAMP(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedbackMessage" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" "public"."FeedbackAuthor" NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FilmStock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "iso" INTEGER,
    "description" TEXT,
    "imageStatus" TEXT NOT NULL DEFAULT 'none',
    "imageUploadedAt" TIMESTAMP(3),
    "imageUploadedBy" TEXT,
    "imageUrl" TEXT,
    "exposures" TEXT,
    "filmType" TEXT,
    "format" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manufacturer" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colorBalance" "public"."ColorBalance",
    "process" "public"."FilmProcess" NOT NULL,

    CONSTRAINT "FilmStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Like" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModerationSubmission" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "proposedImage" TEXT,
    "proposedData" JSONB NOT NULL,
    "originalImage" TEXT,
    "originalData" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NoteVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "photoId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Photo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "mediumPath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" TEXT,
    "cameraId" TEXT,
    "filmStockId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenDate" TIMESTAMP(3),
    "blurHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalBytes" INTEGER,
    "visibility" "public"."PhotoVisibility" NOT NULL DEFAULT 'public',

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "detail" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reporterId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SlugHistory" (
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugHistory_pkey" PRIMARY KEY ("kind","slug")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "twitter" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationTokenExpiry" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "public"."Block"("blockedId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "public"."Block"("blockerId" ASC, "blockedId" ASC);

-- CreateIndex
CREATE INDEX "Block_blockerId_idx" ON "public"."Block"("blockerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_name_userId_key" ON "public"."Camera"("name" ASC, "userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_slug_key" ON "public"."Camera"("slug" ASC);

-- CreateIndex
CREATE INDEX "Collection_featured_idx" ON "public"."Collection"("featured" ASC);

-- CreateIndex
CREATE INDEX "Collection_public_idx" ON "public"."Collection"("public" ASC);

-- CreateIndex
CREATE INDEX "Collection_userId_idx" ON "public"."Collection"("userId" ASC);

-- CreateIndex
CREATE INDEX "CollectionPhoto_collectionId_idx" ON "public"."CollectionPhoto"("collectionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPhoto_collectionId_photoId_key" ON "public"."CollectionPhoto"("collectionId" ASC, "photoId" ASC);

-- CreateIndex
CREATE INDEX "CollectionPhoto_photoId_idx" ON "public"."CollectionPhoto"("photoId" ASC);

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "public"."Comment"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Comment_photoId_idx" ON "public"."Comment"("photoId" ASC);

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "public"."Comment"("userId" ASC);

-- CreateIndex
CREATE INDEX "CommunityNote_createdAt_idx" ON "public"."CommunityNote"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "CommunityNote_targetType_targetId_idx" ON "public"."CommunityNote"("targetType" ASC, "targetId" ASC);

-- CreateIndex
CREATE INDEX "CommunityNote_userId_idx" ON "public"."CommunityNote"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_reference_key" ON "public"."Feedback"("reference" ASC);

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "public"."Feedback"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "public"."Feedback"("userId" ASC);

-- CreateIndex
CREATE INDEX "FeedbackMessage_feedbackId_createdAt_idx" ON "public"."FeedbackMessage"("feedbackId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "FilmStock_colorBalance_idx" ON "public"."FilmStock"("colorBalance" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FilmStock_name_key" ON "public"."FilmStock"("name" ASC);

-- CreateIndex
CREATE INDEX "FilmStock_process_idx" ON "public"."FilmStock"("process" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FilmStock_slug_key" ON "public"."FilmStock"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "public"."Follow"("followerId" ASC, "followingId" ASC);

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "public"."Follow"("followerId" ASC);

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "public"."Follow"("followingId" ASC);

-- CreateIndex
CREATE INDEX "Like_photoId_idx" ON "public"."Like"("photoId" ASC);

-- CreateIndex
CREATE INDEX "Like_userId_idx" ON "public"."Like"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_photoId_key" ON "public"."Like"("userId" ASC, "photoId" ASC);

-- CreateIndex
CREATE INDEX "ModerationSubmission_createdAt_idx" ON "public"."ModerationSubmission"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "ModerationSubmission_resourceType_resourceId_idx" ON "public"."ModerationSubmission"("resourceType" ASC, "resourceId" ASC);

-- CreateIndex
CREATE INDEX "ModerationSubmission_status_idx" ON "public"."ModerationSubmission"("status" ASC);

-- CreateIndex
CREATE INDEX "ModerationSubmission_submittedBy_idx" ON "public"."ModerationSubmission"("submittedBy" ASC);

-- CreateIndex
CREATE INDEX "NoteVote_noteId_idx" ON "public"."NoteVote"("noteId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NoteVote_userId_noteId_key" ON "public"."NoteVote"("userId" ASC, "noteId" ASC);

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "public"."Notification"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "public"."Notification"("userId" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "public"."Notification"("userId" ASC, "read" ASC);

-- CreateIndex
CREATE INDEX "Photo_cameraId_idx" ON "public"."Photo"("cameraId" ASC);

-- CreateIndex
CREATE INDEX "Photo_createdAt_idx" ON "public"."Photo"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Photo_filmStockId_idx" ON "public"."Photo"("filmStockId" ASC);

-- CreateIndex
CREATE INDEX "Photo_published_cameraId_idx" ON "public"."Photo"("published" ASC, "cameraId" ASC);

-- CreateIndex
CREATE INDEX "Photo_published_createdAt_idx" ON "public"."Photo"("published" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Photo_published_filmStockId_idx" ON "public"."Photo"("published" ASC, "filmStockId" ASC);

-- CreateIndex
CREATE INDEX "Photo_published_idx" ON "public"."Photo"("published" ASC);

-- CreateIndex
CREATE INDEX "Photo_published_visibility_createdAt_idx" ON "public"."Photo"("published" ASC, "visibility" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Photo_userId_idx" ON "public"."Photo"("userId" ASC);

-- CreateIndex
CREATE INDEX "Photo_visibility_idx" ON "public"."Photo"("visibility" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "public"."Report"("reporterId" ASC, "targetType" ASC, "targetId" ASC);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "public"."Report"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "public"."Report"("targetType" ASC, "targetId" ASC);

-- CreateIndex
CREATE INDEX "SlugHistory_kind_targetId_idx" ON "public"."SlugHistory"("kind" ASC, "targetId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username" ASC);

-- AddForeignKey
ALTER TABLE "public"."Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Camera" ADD CONSTRAINT "Camera_defaultFilmStockId_fkey" FOREIGN KEY ("defaultFilmStockId") REFERENCES "public"."FilmStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Camera" ADD CONSTRAINT "Camera_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionPhoto" ADD CONSTRAINT "CollectionPhoto_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "public"."Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionPhoto" ADD CONSTRAINT "CollectionPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityNote" ADD CONSTRAINT "CommunityNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "public"."Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Like" ADD CONSTRAINT "Like_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoteVote" ADD CONSTRAINT "NoteVote_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "public"."CommunityNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoteVote" ADD CONSTRAINT "NoteVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Photo" ADD CONSTRAINT "Photo_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "public"."Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Photo" ADD CONSTRAINT "Photo_filmStockId_fkey" FOREIGN KEY ("filmStockId") REFERENCES "public"."FilmStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Photo" ADD CONSTRAINT "Photo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

