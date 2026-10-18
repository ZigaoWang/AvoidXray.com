-- Single-column indexes that are each the leading column of a unique or
-- composite index on the same table. Postgres answers a lookup on that column
-- from the wider index just as well, so these only cost a write and the disk
-- on every insert, like, follow and notification.
--
--   Like_userId_idx                  -> Like_userId_photoId_key
--   Follow_followerId_idx            -> Follow_followerId_followingId_key
--   Block_blockerId_idx              -> Block_blockerId_blockedId_key
--   CollectionPhoto_collectionId_idx -> CollectionPhoto_collectionId_photoId_key
--   Notification_userId_idx          -> Notification_userId_read_idx, Notification_userId_createdAt_idx
--   Photo_published_idx              -> Photo_published_createdAt_idx and the other published-first indexes

DROP INDEX IF EXISTS "Like_userId_idx";
DROP INDEX IF EXISTS "Follow_followerId_idx";
DROP INDEX IF EXISTS "Block_blockerId_idx";
DROP INDEX IF EXISTS "CollectionPhoto_collectionId_idx";
DROP INDEX IF EXISTS "Notification_userId_idx";
DROP INDEX IF EXISTS "Photo_published_idx";
