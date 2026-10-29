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

-- Someone to attribute a review to, so a foreign key is never what fails in a
-- block that is testing a CHECK.
INSERT INTO "User" (id, email, username, "passwordHash")
VALUES ('test_user', 'constraints@test.invalid', 'constraints_test', 'x');

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

-- 21. A verifier is recorded with the moment they verified — a row cannot name
--     someone without saying when.
DO $$
BEGIN
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source","verifiedById")
  VALUES ('FILM_STOCK', 'test_colour', 'iso', 'ADMIN', 'test_user');
  RAISE EXCEPTION 'FieldProvenance_verifier_has_time allowed a verifier with no timestamp';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 21b. But the verification outlives the account that made it. The reviewer
--      column is SET NULL on delete, and the rule used to require the two to be
--      present or absent together, so deleting anyone who had ever verified a
--      field was refused outright and admin user deletion could not remove a
--      moderator who had done any work. The date stays; the person may not.
DO $$
BEGIN
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source","verifiedAt")
  VALUES ('FILM_STOCK', 'test_colour', 'polarity', 'ADMIN', now());
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'FieldProvenance refused a verification whose account is gone';
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

-- 28b. A revision names its reviewer with the moment of review, the same rule
--      FieldProvenance carries.
--
--      Kept PENDING deliberately. A settled row with no timestamp is already
--      refused by Revision_settled_is_reviewed, so asserting it that way would
--      pass whether Revision_reviewer_has_time existed or not — which it did,
--      until this comment was written and the test was watched failing.
DO $$
BEGIN
  INSERT INTO "Revision" ("id","entityType","entityId","payload","source","reviewedById")
  VALUES ('test_rev_2b','FILM_STOCK','test_colour','{"iso":400}','USER','test_user');
  RAISE EXCEPTION 'Revision_reviewer_has_time allowed a reviewer with no timestamp';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 28c. And the review outlives the account that made it, so deleting a
--      moderator is not blocked by the work they reviewed.
DO $$
BEGIN
  INSERT INTO "Revision" ("id","entityType","entityId","payload","source","status","reviewedAt")
  VALUES ('test_rev_2c','FILM_STOCK','test_colour','{"iso":400}','USER','APPROVED', now());
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Revision refused a review whose account is gone';
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

-- 34. A community photo must have an uploader.
DO $$
BEGIN
  INSERT INTO "Photo" (id, "originalPath", "thumbnailPath", "mediumPath", width, height, kind)
  VALUES ('test_ownerless', 'o', 't', 'm', 1, 1, 'community');
  RAISE EXCEPTION 'Photo_owner_matches_kind allowed a community photo with no owner';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 35. An archive photo belongs to no account.
DO $$
BEGIN
  INSERT INTO "Photo" (id, "userId", "originalPath", "thumbnailPath", "mediumPath", width, height, kind)
  VALUES ('test_owned_archive', 'test_user', 'o', 't', 'm', 1, 1, 'archive');
  RAISE EXCEPTION 'Photo_owner_matches_kind allowed an archive photo with an owner';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 36. Both legal shapes are accepted.
INSERT INTO "Photo" (id, "userId", "originalPath", "thumbnailPath", "mediumPath", width, height)
VALUES ('test_community_photo', 'test_user', 'o', 't', 'm', 1, 1);
INSERT INTO "Photo" (id, "originalPath", "thumbnailPath", "mediumPath", width, height, kind)
VALUES ('test_archive_photo', 'o', 't', 'm', 1, 1, 'archive');

-- 37. Labs are cleaned up like the other four: deleting one takes its
--     provenance with it (Lab_provenance_cleanup, 20261030120000).
DO $$
DECLARE remaining int;
BEGIN
  INSERT INTO "Lab" (id, slug, name) VALUES ('test_probe_lab', 'test-probe-lab', 'Test Probe Lab');
  INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
  VALUES ('LAB', 'test_probe_lab', 'name', 'IMPORT');

  DELETE FROM "Lab" WHERE id = 'test_probe_lab';

  SELECT count(*) INTO remaining FROM "FieldProvenance" WHERE "entityId" = 'test_probe_lab';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Lab_provenance_cleanup left % orphaned provenance rows', remaining;
  END IF;
END $$;

-- 38. An archive photo keeps no original, so it cannot name one.
DO $$
BEGIN
  INSERT INTO "Photo" (id, "originalPath", "thumbnailPath", "mediumPath", "originalKey", width, height, kind)
  VALUES ('test_archive_original', 'o', 't', 'm', 'originals/x.jpg', 1, 1, 'archive');
  RAISE EXCEPTION 'Photo_original_matches_kind allowed an archive photo with an original';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 39. `published` and `uploadComplete` stay one value whichever name is
--     written (Photo_published_mirror, transitional).
DO $$
DECLARE r record;
BEGIN
  INSERT INTO "Photo" (id, "userId", "originalPath", "thumbnailPath", "mediumPath", width, height, published)
  VALUES ('test_mirror', 'test_user', 'o', 't', 'm', 1, 1, true);
  SELECT published, "uploadComplete" INTO r FROM "Photo" WHERE id = 'test_mirror';
  IF NOT r."uploadComplete" THEN RAISE EXCEPTION 'an insert through published did not set uploadComplete'; END IF;
  UPDATE "Photo" SET "uploadComplete" = false WHERE id = 'test_mirror';
  SELECT published, "uploadComplete" INTO r FROM "Photo" WHERE id = 'test_mirror';
  IF r.published THEN RAISE EXCEPTION 'published did not follow uploadComplete'; END IF;
  UPDATE "Photo" SET published = true WHERE id = 'test_mirror';
  SELECT published, "uploadComplete" INTO r FROM "Photo" WHERE id = 'test_mirror';
  IF NOT r."uploadComplete" THEN RAISE EXCEPTION 'uploadComplete did not follow a write to published'; END IF;
END $$;

-- 40. Code that writes URLs and no keys gets keys from the URLs; a route
--     address names no key and leaves the key alone (Photo_keys_from_paths,
--     transitional).
DO $$
DECLARE r record;
BEGIN
  INSERT INTO "Photo" (id, "userId", "originalPath", "thumbnailPath", "mediumPath", width, height)
  VALUES ('test_keys', 'test_user', 'https://bucket.example/originals/a.jpg',
          'https://bucket.example/thumbs/a.webp', '/local-uploads/medium/a.webp', 1, 1);
  SELECT "originalKey", "thumbKey", "mediumKey" INTO r FROM "Photo" WHERE id = 'test_keys';
  IF (r."originalKey", r."thumbKey", r."mediumKey") IS DISTINCT FROM ('originals/a.jpg', 'thumbs/a.webp', 'medium/a.webp') THEN
    RAISE EXCEPTION 'keys were not taken from the URLs: %', r;
  END IF;
  UPDATE "Photo" SET "thumbnailPath" = 'https://bucket.example/thumbs/b.webp' WHERE id = 'test_keys';
  UPDATE "Photo" SET "mediumPath" = '/api/photos/test_keys/image/medium?v=1' WHERE id = 'test_keys';
  SELECT "thumbKey", "mediumKey" INTO r FROM "Photo" WHERE id = 'test_keys';
  IF (r."thumbKey", r."mediumKey") IS DISTINCT FROM ('thumbs/b.webp', 'medium/a.webp') THEN
    RAISE EXCEPTION 'keys did not follow a URL write correctly: %', r;
  END IF;
END $$;

-- 41. A photo in a roll takes the roll's camera and lab, cannot be given
--     others, follows the roll when it changes, and keeps working when an
--     entry the roll uses is deleted (Photo_follows_roll, Roll_details_to_photos).
INSERT INTO "Camera" (id, name) VALUES ('test_roll_camera', 'Test Roll Camera'), ('test_other_camera', 'Test Other Camera');
INSERT INTO "Lab" (id, slug, name) VALUES ('test_roll_lab', 'test-roll-lab', 'Test Roll Lab');
INSERT INTO "User" (id, email, "passwordHash", username)
VALUES ('test_roll_stranger', 'test-roll-stranger@example.invalid', 'x', 'test_roll_stranger');
INSERT INTO "Roll" (id, "ownerId", "cameraId", "labId") VALUES ('test_roll', 'test_user', 'test_roll_camera', 'test_roll_lab');
INSERT INTO "Photo" (id, "userId", "originalPath", "thumbnailPath", "mediumPath", width, height, "rollId", "rollPosition")
VALUES ('test_roll_photo', 'test_user', 'o', 't', 'm', 1, 1, 'test_roll', 1);
DO $$
DECLARE r record;
BEGIN
  SELECT "cameraId", "labId" INTO r FROM "Photo" WHERE id = 'test_roll_photo';
  IF (r."cameraId", r."labId") IS DISTINCT FROM ('test_roll_camera', 'test_roll_lab') THEN
    RAISE EXCEPTION 'a photo joining a roll did not take its details: %', r;
  END IF;
  UPDATE "Roll" SET "cameraId" = 'test_other_camera' WHERE id = 'test_roll';
  IF (SELECT "cameraId" FROM "Photo" WHERE id = 'test_roll_photo') IS DISTINCT FROM 'test_other_camera' THEN
    RAISE EXCEPTION 'a roll''s new camera did not reach its photo';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE "Photo" SET "cameraId" = 'test_roll_camera' WHERE id = 'test_roll_photo';
  RAISE EXCEPTION 'Photo_details_follow_roll allowed a photo in a roll its own camera';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$
BEGIN
  INSERT INTO "Photo" (id, "userId", "originalPath", "thumbnailPath", "mediumPath", width, height, "rollId")
  VALUES ('test_roll_foreign', 'test_roll_stranger', 'o', 't', 'm', 1, 1, 'test_roll');
  RAISE EXCEPTION 'Photo_roll_same_owner allowed a photo into someone else''s roll';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$
BEGIN
  UPDATE "Roll" SET "ownerId" = 'test_roll_stranger' WHERE id = 'test_roll';
  RAISE EXCEPTION 'Roll_owner_fixed allowed a roll to change owner';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$
BEGIN
  UPDATE "Photo" SET "rollPosition" = 2, "rollId" = NULL WHERE id = 'test_community_photo';
  IF (SELECT "rollPosition" FROM "Photo" WHERE id = 'test_community_photo') IS NOT NULL THEN
    RAISE EXCEPTION 'a loose photo kept a frame number';
  END IF;
END $$;

DO $$
BEGIN
  DELETE FROM "Lab" WHERE id = 'test_roll_lab';
  IF (SELECT "labId" FROM "Photo" WHERE id = 'test_roll_photo') IS NOT NULL
     OR (SELECT "labId" FROM "Roll" WHERE id = 'test_roll') IS NOT NULL THEN
    RAISE EXCEPTION 'deleting a lab left it on the roll or its photo';
  END IF;
  DELETE FROM "Camera" WHERE id = 'test_other_camera';
  IF (SELECT "cameraId" FROM "Photo" WHERE id = 'test_roll_photo') IS NOT NULL THEN
    RAISE EXCEPTION 'deleting a camera left it on a photo in the roll';
  END IF;
END $$;

-- 42. A roll's dates come with their precision, a month is stored as the 1st,
--     the range runs forwards, and an exposure index is positive.
DO $$
DECLARE bad text;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    $q$INSERT INTO "Roll" (id, "ownerId", "shotFrom") VALUES ('test_bad_roll', 'test_user', '2026-03-01')$q$,
    $q$INSERT INTO "Roll" (id, "ownerId", "shotFrom", "shotFromPrecision") VALUES ('test_bad_roll', 'test_user', '2026-03-15', 'month')$q$,
    $q$INSERT INTO "Roll" (id, "ownerId", "shotFrom", "shotFromPrecision", "shotTo", "shotToPrecision") VALUES ('test_bad_roll', 'test_user', '2026-03-15', 'day', '2026-03-01', 'day')$q$,
    $q$INSERT INTO "Roll" (id, "ownerId", "developedAtPrecision") VALUES ('test_bad_roll', 'test_user', 'day')$q$,
    $q$INSERT INTO "Roll" (id, "ownerId", ei) VALUES ('test_bad_roll', 'test_user', 0)$q$
  ] LOOP
    BEGIN
      EXECUTE bad;
      RAISE EXCEPTION 'a Roll CHECK allowed: %', bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  INSERT INTO "Roll" (id, "ownerId", "shotFrom", "shotFromPrecision", "shotTo", "shotToPrecision", ei)
  VALUES ('test_good_roll', 'test_user', '2026-03-01', 'month', '2026-04-12', 'day', 1600);
END $$;

-- 43. Import items: sizes are positive, a position goes with the roll, a finished
--     item names its photo, an item only goes in its owner's roll, and one
--     file is only on its way once per owner.
INSERT INTO "Import" (id, "userId") VALUES ('test_import', 'test_user');
INSERT INTO "Roll" (id, "ownerId") VALUES ('test_import_roll', 'test_user');
DO $$
DECLARE bad text;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    $q$INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize") VALUES ('test_bad_item', 'test_import', 'test_user', 'a.jpg', 0, 'h0', 'originals/t0.jpg', 8388608)$q$,
    $q$INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize") VALUES ('test_bad_item', 'test_import', 'test_user', 'a.jpg', 10, 'h0', 'originals/t0.jpg', 0)$q$,
    $q$INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize", state) VALUES ('test_bad_item', 'test_import', 'test_user', 'a.jpg', 10, 'h0', 'originals/t0.jpg', 8388608, 'done')$q$
  ] LOOP
    BEGIN
      EXECUTE bad;
      RAISE EXCEPTION 'an ImportItem CHECK allowed: %', bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;

  BEGIN
    INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize", "rollId")
    VALUES ('test_bad_item', 'test_import', 'test_roll_stranger', 'a.jpg', 10, 'h0', 'originals/t0.jpg', 8388608, 'test_import_roll');
    RAISE EXCEPTION 'an item was put in a roll its owner does not own';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize", "rollId", "rollPosition")
  VALUES ('test_item_1', 'test_import', 'test_user', 'a.jpg', 10, 'h1', 'originals/t1.jpg', 8388608, 'test_import_roll', 1);
  BEGIN
    INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize")
    VALUES ('test_item_2', 'test_import', 'test_user', 'a copy.jpg', 10, 'h1', 'originals/t2.jpg', 8388608);
    RAISE EXCEPTION 'the same file was registered twice while still uploading';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE "ImportItem" SET state = 'failed' WHERE id = 'test_item_1';
  INSERT INTO "ImportItem" (id, "importId", "userId", filename, bytes, sha256, "originalKey", "partSize")
  VALUES ('test_item_2', 'test_import', 'test_user', 'a copy.jpg', 10, 'h1', 'originals/t2.jpg', 8388608);

  UPDATE "ImportItem" SET "rollId" = NULL WHERE id = 'test_item_1';
  IF (SELECT "rollPosition" FROM "ImportItem" WHERE id = 'test_item_1') IS NOT NULL THEN
    RAISE EXCEPTION 'leaving the roll kept the frame position';
  END IF;
END $$;

ROLLBACK;
