-- Names a camera is also sold under.
--
-- Bodies are routinely renamed by region, so a body stored under one name is
-- unfindable to everyone who owns the other. Film stocks and brands have
-- carried alternate names for a while and search already reads them; cameras
-- were the gap.
--
-- No backfill. The alternate names are stated in the descriptions on these
-- records, but a description written in-house is not a source, and several were
-- drafted with model assistance. They are proposed for review rather than
-- written here.

ALTER TABLE "Camera" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
