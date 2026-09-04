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

-- A colour stock and a monochrome one to attack. Brands come from the phase 2
-- migration, which seeds sixteen of them.
-- test_mono carries its maker in the same statement: the status constraint is
-- row-level and immediate, so KNOWN with a null maker cannot exist even for the
-- duration of a follow-up UPDATE. It is shaped like HP5 Plus — an Ilford-branded
-- film coated by Harman.
INSERT INTO "FilmStock"
  (id, name, process, chromaticity, polarity, "colorBalance",
   "brandId", "manufacturerStatus", "manufacturedByBrandId")
VALUES
  ('test_colour', 'Test Colour 400', 'C-41', 'COLOR',      'NEGATIVE', 'Daylight',
   'brand_kodak',  'SAME_AS_BRAND', NULL),
  ('test_mono',   'Test Mono 400',   'B&W',  'MONOCHROME', 'NEGATIVE', 'N/A',
   'brand_ilford', 'KNOWN',         'brand_harman');

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

-- 8. A confirmed maker requires a maker. KNOWN with nothing to point at is a
--    claim with no content.
DO $$
BEGIN
  UPDATE "FilmStock" SET "manufacturedByBrandId" = NULL WHERE id = 'test_mono';
  RAISE EXCEPTION 'FilmStock_manufacturer_status_matches_column allowed KNOWN with no maker';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 9. And the other direction: a brand that coats its own film cannot also name
--    someone else, or the page has two answers and no way to choose.
DO $$
BEGIN
  UPDATE "FilmStock" SET "manufacturedByBrandId" = 'brand_harman' WHERE id = 'test_colour';
  RAISE EXCEPTION 'FilmStock_manufacturer_status_matches_column allowed SAME_AS_BRAND with a maker';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 10. UNKNOWN means nobody has established it, so it cannot carry a maker
--     either. This is the half that keeps UNKNOWN and ATTRIBUTED distinct.
DO $$
BEGIN
  UPDATE "FilmStock"
     SET "manufacturerStatus" = 'UNKNOWN', "manufacturedByBrandId" = 'brand_kodak'
   WHERE id = 'test_colour';
  RAISE EXCEPTION 'FilmStock_manufacturer_status_matches_column allowed UNKNOWN with a maker';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 11. ATTRIBUTED does require one — it is a reported maker, not an absent one.
DO $$
BEGIN
  UPDATE "FilmStock"
     SET "manufacturerStatus" = 'ATTRIBUTED', "manufacturedByBrandId" = NULL
   WHERE id = 'test_colour';
  RAISE EXCEPTION 'FilmStock_manufacturer_status_matches_column allowed ATTRIBUTED with no maker';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 12. A maker equal to the brand is SAME_AS_BRAND, never KNOWN pointing at
--     itself. One representation per fact, so a filter cannot miss half of them.
DO $$
BEGIN
  UPDATE "FilmStock"
     SET "manufacturerStatus" = 'KNOWN', "manufacturedByBrandId" = 'brand_kodak'
   WHERE id = 'test_colour';
  RAISE EXCEPTION 'FilmStock_manufacturer_differs_from_brand allowed a self-referential maker';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 13. The shape the whole phase exists for: a brand selling film someone else
--     is reported to coat. Kentmere/Harman, Yes!Star/Kodak.
UPDATE "FilmStock"
   SET "manufacturerStatus" = 'ATTRIBUTED', "manufacturedByBrandId" = 'brand_harman'
 WHERE id = 'test_colour';

-- 14. Brand ownership is not manufacture, and nothing may assume otherwise:
--     Ilford must not point at Harman. Asserted because the temptation to add
--     that edge is exactly what would make Ilfocolor's maker silently wrong.
DO $$
DECLARE parent text;
BEGIN
  SELECT "parentBrandId" INTO parent FROM "Brand" WHERE id = 'brand_ilford';
  IF parent IS NOT NULL THEN
    RAISE EXCEPTION 'Ilford has a parentBrandId (%). It is a trademark licensee, not a subsidiary.', parent;
  END IF;
END $$;

-- 15. A stock cannot be respooled from itself.
DO $$
BEGIN
  UPDATE "FilmStock" SET "parentStockId" = id WHERE id = 'test_colour';
  RAISE EXCEPTION 'FilmStock_parent_is_not_self allowed a stock to be its own parent';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 16. Respooling from another stock is the shape the column exists for.
UPDATE "FilmStock" SET "parentStockId" = 'test_mono' WHERE id = 'test_colour';

ROLLBACK;
