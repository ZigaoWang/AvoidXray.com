-- A camera's creator is provenance, not ownership.
--
-- A camera page is a shared catalogue entry that many people's photos point at.
-- It is not owned by whoever added it, so the column grants no rights, and the
-- cascade on it was a live data-loss bug: deleting a contributor deleted every
-- camera they had ever added and orphaned every photo pointing at one.
--
-- The name becomes unique on its own. It was unique per creator, which let the
-- same model exist several times over as long as different people added it,
-- which is the opposite of what a catalogue is for.

ALTER TABLE "Camera" DROP CONSTRAINT IF EXISTS "Camera_userId_fkey";
ALTER TABLE "Camera" DROP CONSTRAINT IF EXISTS "Camera_name_userId_key";
DROP INDEX IF EXISTS "Camera_name_userId_key";

ALTER TABLE "Camera" RENAME COLUMN "userId" TO "addedById";
ALTER TABLE "Camera" ALTER COLUMN "addedById" DROP NOT NULL;

ALTER TABLE "Camera" ADD CONSTRAINT "Camera_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Camera_name_key" ON "Camera"("name");
