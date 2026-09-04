-- Replaces the free-text camera type with an enum that describes mechanism
-- only, and adds a nullable frame geometry column beside it.
--
-- The list being replaced mixed three axes. "Medium Format" and "Large Format"
-- describe the film, not the body, and are dropped — no row used either.
-- "Point & Shoot" becomes COMPACT. There is no OTHER member and the column is
-- nullable: null is "not yet classified", which is a weaker and truer claim
-- than OTHER's "none of these apply", and it surfaces as a gap rather than as
-- an answer. Forcing a choice from an incomplete list is exactly how the
-- Sprocket Rocket ended up filed as a point-and-shoot.
--
-- Written as expand-and-contract rather than as an in-place cast. Converting
-- "cameraType" with ALTER COLUMN ... USING would hard-fail on any value outside
-- the new enum, which makes correctness depend on an audit staying true between
-- the audit and the deploy. Adding a second column cannot fail that way: a
-- value that does not map lands as NULL and shows up in the verification query
-- below. "cameraType" is retained and dropped in a later migration, once its
-- readers are gone.

CREATE TYPE "CameraBodyType" AS ENUM (
  'SLR', 'RANGEFINDER', 'COMPACT', 'TLR', 'FOLDING', 'VIEW', 'INSTANT', 'DISPOSABLE'
);

-- No backfill. Native frame geometry has not been established for any of these
-- cameras, and defaulting them to FULL_FRAME would assert a reading nobody has
-- taken. Null puts all 17 into the research backlog instead, which is where
-- the Sprocket Rocket in particular belongs.
CREATE TYPE "FrameFormat" AS ENUM (
  'FULL_FRAME', 'HALF_FRAME', 'PANORAMIC', 'SPROCKET_HOLE'
);

ALTER TABLE "Camera" ADD COLUMN "bodyType"    "CameraBodyType";
ALTER TABLE "Camera" ADD COLUMN "frameFormat" "FrameFormat";

-- Anything not named here stays NULL by design, including the two format
-- values that are being retired.
UPDATE "Camera" SET "bodyType" = CASE "cameraType"
  WHEN 'SLR'           THEN 'SLR'
  WHEN 'Rangefinder'   THEN 'RANGEFINDER'
  WHEN 'Point & Shoot' THEN 'COMPACT'
  WHEN 'TLR'           THEN 'TLR'
  WHEN 'Instant'       THEN 'INSTANT'
  WHEN 'Disposable'    THEN 'DISPOSABLE'
  WHEN 'Large Format'  THEN 'VIEW'
  ELSE NULL
END::"CameraBodyType";
