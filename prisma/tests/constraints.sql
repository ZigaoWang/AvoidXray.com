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

-- 17. A variant is a roll, a box of sheets, or a bulk length. Never two.
DO $$
BEGIN
  INSERT INTO "FilmVariant" (id, "filmStockId", format, exposures, "sheetCount")
  VALUES ('test_variant_bad', 'test_colour', '35mm', 36, 25);
  RAISE EXCEPTION 'FilmVariant_one_quantity_shape allowed both exposures and a sheet count';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 18. Sheet film is sold in boxes, not on rolls.
DO $$
BEGIN
  INSERT INTO "FilmVariant" (id, "filmStockId", format, exposures)
  VALUES ('test_variant_sheet', 'test_colour', '4x5', 36);
  RAISE EXCEPTION 'FilmVariant_sheets_have_no_exposures allowed exposures on sheet film';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 19. The shapes that are real: a roll, a box of sheets, and the same emulsion
--     in a second gauge, which is the case the split exists for.
INSERT INTO "FilmVariant" (id, "filmStockId", format, exposures) VALUES
  ('test_variant_35', 'test_colour', '35mm', 36),
  ('test_variant_120', 'test_colour', '120', NULL);
INSERT INTO "FilmVariant" (id, "filmStockId", format, "sheetCount")
VALUES ('test_variant_sheets', 'test_colour', '4x5', 25);

-- 20. The same SKU twice is refused.
DO $$
BEGIN
  INSERT INTO "FilmVariant" (id, "filmStockId", format, exposures)
  VALUES ('test_variant_dup', 'test_colour', '35mm', 36);
  RAISE EXCEPTION 'FilmVariant_sku_key allowed a duplicate SKU';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- 21. A verified value records who verified it, and an unverified one cannot
--     claim a verifier. Otherwise a row says it was checked by nobody.
DO $$
BEGIN
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source","verifiedAt")
  VALUES ('FILM_STOCK', 'test_colour', 'iso', 'ADMIN', now());
  RAISE EXCEPTION 'FieldProvenance_verified_has_verifier allowed a verifier-less verification';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 22. A model-written value must name the model, or a bad batch cannot be found
--     and requeued later.
DO $$
BEGIN
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
  VALUES ('FILM_STOCK', 'test_colour', 'process', 'LLM');
  RAISE EXCEPTION 'FieldProvenance_model_only_for_llm allowed an unattributed model value';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 23. And the reverse: a human-entered value cannot carry a model name.
DO $$
BEGIN
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source","model")
  VALUES ('FILM_STOCK', 'test_colour', 'polarity', 'USER', 'some-model');
  RAISE EXCEPTION 'FieldProvenance_model_only_for_llm allowed a model on a non-LLM source';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 24. A cited source has to cite something.
DO $$
BEGIN
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
  VALUES ('FILM_STOCK', 'test_colour', 'chromaticity', 'DATASHEET');
  RAISE EXCEPTION 'FieldProvenance_cited_sources_have_urls allowed a citation with no URL';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 25. The shapes that are real.
INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source","sourceUrl")
VALUES ('FILM_STOCK', 'test_colour', 'iso', 'DATASHEET', 'https://example.invalid/datasheet');
INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source","model","promptHash")
VALUES ('FILM_STOCK', 'test_colour', 'process', 'LLM', 'test-model', 'abc123');

-- 26. Deleting a record takes its provenance with it. Polymorphic rows have no
--     foreign key, so without the trigger they outlive the row and a future
--     record reusing the id would inherit them.
DO $$
DECLARE remaining int;
BEGIN
  INSERT INTO "Brand" (id, slug, name) VALUES ('test_probe_brand', 'test-probe-brand', 'Test Probe Brand');
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
  VALUES ('BRAND', 'test_probe_brand', 'name', 'IMPORT');

  DELETE FROM "Brand" WHERE id = 'test_probe_brand';

  SELECT count(*) INTO remaining FROM "FieldProvenance" WHERE "entityId" = 'test_probe_brand';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'delete_field_provenance left % orphaned provenance rows', remaining;
  END IF;
END $$;

-- 27. A pending revision has decided nothing, so it cannot carry an outcome.
DO $$
BEGIN
  INSERT INTO "Revision" ("id","entityType","entityId","payload","source","appliedFields")
  VALUES ('test_rev_1','FILM_STOCK','test_colour','{"iso":400}','USER','{"iso":400}');
  RAISE EXCEPTION 'Revision_pending_has_no_outcome allowed an outcome on a pending row';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 28. A settled revision records who settled it.
DO $$
BEGIN
  INSERT INTO "Revision" ("id","entityType","entityId","payload","source","status")
  VALUES ('test_rev_2','FILM_STOCK','test_colour','{"iso":400}','USER','APPROVED');
  RAISE EXCEPTION 'Revision_settled_is_reviewed allowed a settled row with no reviewer';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 29. An edit has to change something.
DO $$
BEGIN
  INSERT INTO "Revision" ("id","entityType","entityId","payload","source")
  VALUES ('test_rev_3','FILM_STOCK','test_colour','{}','USER');
  RAISE EXCEPTION 'Revision_payload_is_not_empty allowed an empty payload';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 30. A generated proposal cites every field it proposes. Enforced here rather
--     than asked of a prompt, because a prompt is not a constraint.
DO $$
BEGIN
  INSERT INTO "Revision" ("id","entityType","entityId","payload","source","sourceUrls")
  VALUES ('test_rev_4','FILM_STOCK','test_colour','{"iso":400,"process":"C-41"}','LLM',
          '{"iso":"https://example.invalid"}');
  RAISE EXCEPTION 'Revision_generated_values_are_cited allowed an uncited generated field';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 31. Fully cited it passes, and a human proposal needs no citation at all.
--     That difference is the point of the rule.
INSERT INTO "Revision" ("id","entityType","entityId","payload","source","sourceUrls")
VALUES ('test_rev_5','FILM_STOCK','test_colour','{"iso":400}','LLM','{"iso":"https://example.invalid"}');
INSERT INTO "Revision" ("id","entityType","entityId","payload","source")
VALUES ('test_rev_6','FILM_STOCK','test_colour','{"iso":400}','USER');

-- 32. A record cannot claim a slug that redirects to something else.
INSERT INTO "SlugHistory" ("kind", "slug", "targetId")
VALUES ('camera', 'test-retired-slug', 'test_other_camera');

DO $$
BEGIN
  INSERT INTO "Camera" (id, name, slug, "createdAt", "updatedAt")
  VALUES ('test_thief', 'Test Thief', 'test-retired-slug', now(), now());
  RAISE EXCEPTION 'reject_retired_slug allowed a record to claim a retired slug';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- 33. Reclaiming a slug this same record retired is allowed, so returning to a
--     former name takes its URL back rather than inventing a suffix.
INSERT INTO "Camera" (id, name, slug, "createdAt", "updatedAt")
VALUES ('test_owner', 'Test Owner', 'test-owner-slug', now(), now());
INSERT INTO "SlugHistory" ("kind", "slug", "targetId")
VALUES ('camera', 'test-former-slug', 'test_owner');
UPDATE "Camera" SET slug = 'test-former-slug' WHERE id = 'test_owner';

ROLLBACK;
