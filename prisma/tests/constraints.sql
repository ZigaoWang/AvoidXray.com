-- Assertions for the database objects that Prisma does not model.
--
-- CHECK constraints, triggers and partial indexes live in migration files and
-- nowhere else: `schema.prisma` cannot express them, so `prisma migrate diff`
-- comes back clean whether they are present or not. Nothing else would notice
-- if a future migration rebuilt a table and quietly dropped them.
--
-- Run by CI against a fresh database built from prisma/migrations. Every block
-- either passes silently or raises, and psql is invoked with ON_ERROR_STOP so a
-- raise fails the build. See docs/db-objects.md for the full inventory.
--
-- Everything happens inside a transaction that is rolled back, so the file is
-- repeatable and leaves nothing behind.

BEGIN;

-- A colour stock and a monochrome one to attack.
INSERT INTO "FilmStock" (id, name, process, chromaticity, polarity, "colorBalance")
VALUES
  ('test_colour', 'Test Colour 400', 'C-41', 'COLOR',      'NEGATIVE', 'Daylight'),
  ('test_mono',   'Test Mono 400',   'B&W',  'MONOCHROME', 'NEGATIVE', 'N/A');

-- 1. A colour film cannot be marked "not applicable".
DO $$
BEGIN
  UPDATE "FilmStock" SET "colorBalance" = 'N/A' WHERE id = 'test_colour';
  RAISE EXCEPTION 'FilmStock_colour_balance_not_na did not reject N/A on a colour film';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 2. A monochrome film cannot have no balance at all. This is the case a naive
--    `= 'N/A'` constraint would let through, because a CHECK passes on NULL.
DO $$
BEGIN
  UPDATE "FilmStock" SET "colorBalance" = NULL WHERE id = 'test_mono';
  RAISE EXCEPTION 'FilmStock_mono_balance_not_applicable did not reject a NULL balance';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 3. A monochrome film cannot be balanced for a light source.
DO $$
BEGIN
  UPDATE "FilmStock" SET "colorBalance" = 'Daylight' WHERE id = 'test_mono';
  RAISE EXCEPTION 'FilmStock_mono_balance_not_applicable did not reject Daylight';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 4. The XP2 Super shape must be expressible: monochrome film, C-41 process.
--    This is the case the old single filmType enum got wrong, and the reason
--    chromaticity is a separate column from process.
UPDATE "FilmStock"
   SET "chromaticity" = 'MONOCHROME', process = 'C-41', "colorBalance" = 'N/A'
 WHERE id = 'test_colour';

-- 5. A colour film with an unestablished balance stays legal. NULL means "not
--    known yet", which is the honest state of Orwo Wolfen NC400.
UPDATE "FilmStock"
   SET "chromaticity" = 'COLOR', "colorBalance" = NULL
 WHERE id = 'test_colour';

-- 6. A monochrome positive must be expressible — Fomapan R100, Agfa Scala.
--    The old enum could not say this at all.
UPDATE "FilmStock"
   SET "chromaticity" = 'MONOCHROME', polarity = 'POSITIVE', "colorBalance" = 'N/A'
 WHERE id = 'test_mono';

-- 7. Neither axis accepts a value outside its enum.
DO $$
BEGIN
  EXECUTE $q$UPDATE "FilmStock" SET "chromaticity" = 'SEPIA' WHERE id = 'test_mono'$q$;
  RAISE EXCEPTION 'Chromaticity accepted a value outside the enum';
EXCEPTION WHEN invalid_text_representation THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE $q$UPDATE "Camera" SET "bodyType" = 'PANORAMIC' WHERE true$q$;
  RAISE EXCEPTION 'CameraBodyType accepted PANORAMIC, which belongs to FrameFormat';
EXCEPTION WHEN invalid_text_representation THEN NULL;
END $$;

ROLLBACK;
