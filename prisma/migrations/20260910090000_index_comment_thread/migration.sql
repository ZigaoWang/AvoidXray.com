-- The comment thread under a photo, which is now read a page at a time.
--
-- The route asks for one photo's comments newest first, fifty rows, resuming
-- from the timestamp of the last one it sent. The index on ("photoId") alone
-- let Postgres find the photo's rows but not order them, so it read every
-- comment on the photo and sorted the lot to return one page — and the
-- resumed pages re-read the same rows to skip past them.
--
-- CREATE INDEX rather than CONCURRENTLY, for the reason written out in
-- 20260906130000_lookup_indexes: Prisma runs each migration in a transaction
-- and CONCURRENTLY cannot be used inside one. This locks Comment only for as
-- long as the build takes, which on a table this size is milliseconds.

CREATE INDEX "Comment_photoId_createdAt_idx" ON "Comment"("photoId", "createdAt");

-- The single-column index this supersedes. A composite whose first column is
-- photoId answers everything ("photoId") answered, so keeping both only costs
-- another tree to write on every comment.
DROP INDEX IF EXISTS "Comment_photoId_idx";
