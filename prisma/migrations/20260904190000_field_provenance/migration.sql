-- Records where each stored value came from.
--
-- The catalogue is only worth trusting if a reader can tell a manufacturer
-- datasheet from somebody's recollection, and the backlog of unchecked fields is
-- only workable if it can be queried. Both are this table.
--
-- Everything already in the database is backfilled as IMPORT rather than USER.
-- USER would assert that a contributor entered it, which nobody knows: some of
-- it came through forms, some from an administrator, and some descriptions were
-- drafted with model assistance. IMPORT says only what is true, which is that it
-- predates this table.

CREATE TYPE "ValueSource" AS ENUM ('IMPORT', 'USER', 'ADMIN', 'RESEARCH', 'DATASHEET', 'LLM');
CREATE TYPE "EntityType"  AS ENUM ('FILM_STOCK', 'FILM_VARIANT', 'CAMERA', 'BRAND');

CREATE TABLE "FieldProvenance" (
  "entityType"   "EntityType" NOT NULL,
  "entityId"     TEXT NOT NULL,
  "fieldName"    TEXT NOT NULL,
  "source"       "ValueSource" NOT NULL,
  "sourceUrl"    TEXT,
  "confidence"   DECIMAL(3,2),
  "model"        TEXT,
  "promptHash"   TEXT,
  "verifiedById" TEXT,
  "verifiedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FieldProvenance_pkey" PRIMARY KEY ("entityType", "entityId", "fieldName"),
  CONSTRAINT "FieldProvenance_verifiedById_fkey" FOREIGN KEY ("verifiedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FieldProvenance_entityType_entityId_idx" ON "FieldProvenance"("entityType", "entityId");
CREATE INDEX "FieldProvenance_source_idx" ON "FieldProvenance"("source");

-- The backlog, as an index. Every query that matters here is "what has nobody
-- verified", so the index covers only those rows and stays small as the
-- verified majority grows. Partial indexes are not expressible in Prisma, so
-- this is recorded in docs/db-objects.md.
CREATE INDEX "FieldProvenance_unverified_idx"
  ON "FieldProvenance"("source", "entityType")
  WHERE "verifiedAt" IS NULL;

-- A verified row records who verified it, and an unverified one cannot claim a
-- verifier. Without this a row can say it was checked by nobody in particular.
ALTER TABLE "FieldProvenance" ADD CONSTRAINT "FieldProvenance_verified_has_verifier"
  CHECK (("verifiedAt" IS NULL) = ("verifiedById" IS NULL));

-- A model-written value must say which model wrote it, or a bad batch cannot be
-- found again. Only LLM rows may carry a model or a prompt hash.
ALTER TABLE "FieldProvenance" ADD CONSTRAINT "FieldProvenance_model_only_for_llm"
  CHECK (
    ("source" = 'LLM' AND "model" IS NOT NULL)
    OR ("source" <> 'LLM' AND "model" IS NULL AND "promptHash" IS NULL)
  );

-- A cited source must actually cite something.
ALTER TABLE "FieldProvenance" ADD CONSTRAINT "FieldProvenance_cited_sources_have_urls"
  CHECK ("source" NOT IN ('RESEARCH', 'DATASHEET') OR "sourceUrl" IS NOT NULL);

-- ── Cleanup ────────────────────────────────────────────────────────────────
--
-- Polymorphic rows cannot have a foreign key, so deleting a film stock would
-- otherwise leave its provenance behind for a future row to inherit by reusing
-- the id. One function, parameterised by entity type, with a trigger per table:
-- six hand-written functions would be six places for the logic to drift.

CREATE OR REPLACE FUNCTION delete_field_provenance() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "FieldProvenance"
   WHERE "entityType" = TG_ARGV[0]::"EntityType"
     AND "entityId"   = OLD."id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FilmStock_provenance_cleanup"   AFTER DELETE ON "FilmStock"
  FOR EACH ROW EXECUTE FUNCTION delete_field_provenance('FILM_STOCK');
CREATE TRIGGER "FilmVariant_provenance_cleanup" AFTER DELETE ON "FilmVariant"
  FOR EACH ROW EXECUTE FUNCTION delete_field_provenance('FILM_VARIANT');
CREATE TRIGGER "Camera_provenance_cleanup"      AFTER DELETE ON "Camera"
  FOR EACH ROW EXECUTE FUNCTION delete_field_provenance('CAMERA');
CREATE TRIGGER "Brand_provenance_cleanup"       AFTER DELETE ON "Brand"
  FOR EACH ROW EXECUTE FUNCTION delete_field_provenance('BRAND');

-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- One row per non-null field. Written as a loop over column names rather than
-- one statement per column, so adding a field to the list is one word.

DO $$
DECLARE
  spec RECORD;
  col  TEXT;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('FILM_STOCK', 'FilmStock', ARRAY[
        'name','iso','process','colorBalance','chromaticity','polarity','filmType',
        'exposures','description','brandId','manufacturerStatus','manufacturedByBrandId',
        'parentStockId','respoolNotes','manufacturer','imageUrl']),
      ('FILM_VARIANT', 'FilmVariant', ARRAY[
        'format','exposures','sheetCount','bulkLengthM','productCode','discontinuedYear']),
      ('CAMERA', 'Camera', ARRAY[
        'name','brandId','bodyType','frameFormat','format','mountType','year',
        'description','defaultFilmStockId','imageUrl','brand','cameraType']),
      ('BRAND', 'Brand', ARRAY[
        'name','description','parentBrandId'])
    ) AS t(entity_type, table_name, columns)
  LOOP
    FOREACH col IN ARRAY spec.columns LOOP
      EXECUTE format(
        'INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
         SELECT %L::"EntityType", "id", %L, ''IMPORT''::"ValueSource"
           FROM %I WHERE %I IS NOT NULL
         ON CONFLICT DO NOTHING',
        spec.entity_type, col, spec.table_name, col
      );
    END LOOP;
  END LOOP;
END $$;

-- Array columns, where IS NOT NULL is true of an empty array and would record
-- provenance for a value nobody set.
INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
SELECT 'FILM_STOCK'::"EntityType", "id", 'aliases', 'IMPORT'::"ValueSource"
  FROM "FilmStock" WHERE cardinality("aliases") > 0
ON CONFLICT DO NOTHING;

INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
SELECT 'FILM_STOCK'::"EntityType", "id", 'format', 'IMPORT'::"ValueSource"
  FROM "FilmStock" WHERE cardinality("format") > 0
ON CONFLICT DO NOTHING;

INSERT INTO "FieldProvenance" ("entityType","entityId","fieldName","source")
SELECT 'BRAND'::"EntityType", "id", 'aliases', 'IMPORT'::"ValueSource"
  FROM "Brand" WHERE cardinality("aliases") > 0
ON CONFLICT DO NOTHING;

-- ── Sourced values ─────────────────────────────────────────────────────────
--
-- The attributions set during the brands work were researched and cited, so
-- they are not IMPORT. Transcribed from prisma/seed/manufacturer-attributions.json,
-- which stays the human-readable record with the reasoning behind each.

UPDATE "FieldProvenance" p
   SET "source" = 'RESEARCH', "sourceUrl" = v.url
  FROM (VALUES
    ('Ilford HP5 Plus 400',            'https://en.wikipedia.org/wiki/Ilford_Photo'),
    ('Kentmere Pan 400',               'https://en.wikipedia.org/wiki/Ilford_Photo'),
    ('Fujifilm 400',                   'https://en.wikipedia.org/wiki/Fujifilm_Superia'),
    ('Lucky Color 200',                'https://kosmofoto.com/2025/08/reflx-lab-shows-results-from-first-batch-of-new-lucky-color-200-film/'),
    ('Lucky Color 400',                'https://www.35mmc.com/31/05/2026/lucky-color-400-5-frames-with-this-soon-to-be-released-film/'),
    ('Orwo Wolfen NC400',              'https://www.ballardfilm.com/products/wolfen-nc400-color'),
    ('Yes!Star 400',                   'https://www.fujirumors.com/yesstar-s1-camera-to-be-launched-july-1-with-yesstar-400-film-rebranded-fujifilm-c400/')
  ) AS v(stock_name, url)
  JOIN "FilmStock" f ON f."name" = v.stock_name
 WHERE p."entityType" = 'FILM_STOCK'
   AND p."entityId"   = f."id"
   AND p."fieldName" IN ('manufacturerStatus', 'manufacturedByBrandId');

-- The one field filled from a source rather than left null, so it carries that
-- source rather than reading as though it were always there.
UPDATE "FieldProvenance" p
   SET "source" = 'RESEARCH',
       "sourceUrl" = 'https://www.bhphotovideo.com/c/product/1783229-REG/orwo_nc400_16mm_100ft_400_iso_16mm_color.html'
  FROM "FilmStock" f
 WHERE p."entityType" = 'FILM_STOCK'
   AND p."entityId"   = f."id"
   AND f."name"       = 'Orwo Wolfen NC400'
   AND p."fieldName"  = 'colorBalance';
