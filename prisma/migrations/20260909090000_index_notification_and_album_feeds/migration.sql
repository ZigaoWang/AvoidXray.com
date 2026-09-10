-- The two feeds that were sorting a whole partition to return one page.
--
-- The notification poll asks for one account's twenty newest, every two
-- minutes for every open tab. The index on ("userId") alone let Postgres find
-- that account's rows but not order them, so it read all of them and sorted.
--
-- The album pager asks for public albums newest first, twenty-four at a time,
-- and ("public") alone made every page of the pager re-sort the whole set.
--
-- CREATE INDEX rather than CONCURRENTLY, for the reason written out in
-- 20260906130000_lookup_indexes: Prisma runs each migration in a transaction
-- and CONCURRENTLY cannot be used inside one. These lock each table only for
-- as long as the build takes, which on tables this size is milliseconds.

CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Collection_public_createdAt_idx" ON "Collection"("public", "createdAt");
