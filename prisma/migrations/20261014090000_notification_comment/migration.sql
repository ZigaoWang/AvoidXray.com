-- The comment a comment notification is about, so the bell can quote it and
-- open the photo at it. Removed with the comment.
ALTER TABLE "Notification" ADD COLUMN "commentId" TEXT;

CREATE INDEX "Notification_commentId_idx" ON "Notification"("commentId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
