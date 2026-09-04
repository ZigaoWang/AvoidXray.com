-- Separates who a product is sold as from who makes it.
--
-- `manufacturer` was one free-text column doing both jobs, which forces a false
-- claim on every house brand, respool and rebadge. Kentmere Pan 400 was filed
-- as manufacturer=Harman, which is true of the coater and loses the fact that
-- Kentmere is the brand. Lomography was filed as a manufacturer; it coats
-- nothing.
--
-- Brand ids are readable literals rather than cuids. There are sixteen of them,
-- they are referenced by the seed file that carries the sourcing for these
-- attributions, and a migration that reads `brand_kodak` can be checked by eye.
-- Rows created later through the application get ordinary cuids.
--
-- Both legacy columns are retained. FilmStock.manufacturer and Camera.brand are
-- dropped in a later migration, once their readers are gone.

CREATE TYPE "ManufacturerStatus" AS ENUM ('SAME_AS_BRAND', 'KNOWN', 'ATTRIBUTED', 'UNKNOWN');

CREATE TABLE "Brand" (
  "id"            TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "aliases"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "description"   TEXT,
  "parentBrandId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Brand_parentBrandId_fkey" FOREIGN KEY ("parentBrandId")
    REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");
CREATE INDEX "Brand_parentBrandId_idx" ON "Brand"("parentBrandId");

-- The sixteen brands. Six are referenced from both the film and the camera
-- side, which is why there is one table and no `type` column on it.
INSERT INTO "Brand" ("id", "slug", "name", "aliases", "description") VALUES
  ('brand_kodak',      'kodak',      'Kodak',      ARRAY['Eastman Kodak'], NULL),
  ('brand_fujifilm',   'fujifilm',   'Fujifilm',   ARRAY['Fuji', 'Fujicolor'], NULL),
  ('brand_harman',     'harman',     'Harman',     ARRAY['Harman Technology'],
   'Mobberley, UK. Coats its own Harman-branded film and, under licence, the Ilford black and white range.'),
  ('brand_ilford',     'ilford',     'Ilford',     ARRAY['Ilford Photo'],
   'Two companies print ILFORD on a box. The black and white films are made by Harman Technology, trading as Ilford Photo under licence. The Ilfocolor colour films come from Ilford Imaging Europe GmbH, which owns the trademark. Neither is a parent of the other, so the maker is recorded per stock.'),
  ('brand_kentmere',   'kentmere',   'Kentmere',   ARRAY[]::TEXT[], NULL),
  ('brand_cinestill',  'cinestill',  'Cinestill',  ARRAY['CineStill'], NULL),
  ('brand_ferrania',   'ferrania',   'Ferrania',   ARRAY['FILM Ferrania'], NULL),
  ('brand_lomography', 'lomography', 'Lomography', ARRAY['Lomo'], NULL),
  ('brand_lucky',      'lucky',      'Lucky',      ARRAY['China Lucky Film', 'Lucky Film'], NULL),
  ('brand_orwo',       'orwo',       'Orwo',       ARRAY['ORWO', 'Orwo Wolfen'], NULL),
  ('brand_yesstar',    'yesstar',    'Yes!Star',   ARRAY['Yestar', 'Guangxi Giant Star'], NULL),
  ('brand_canon',      'canon',      'Canon',      ARRAY[]::TEXT[], NULL),
  ('brand_konica',     'konica',     'Konica',     ARRAY[]::TEXT[], NULL),
  ('brand_olympus',    'olympus',    'Olympus',    ARRAY[]::TEXT[], NULL),
  ('brand_pentax',     'pentax',     'Pentax',     ARRAY[]::TEXT[], NULL),
  ('brand_fujica',     'fujica',     'Fujica',     ARRAY['FUJICA'], NULL);

-- Corporate ownership only, and only where it is genuine.
--
-- Ilford is deliberately absent. Harman trades as Ilford Photo under licence
-- from Ilford Imaging Europe, which owns the mark — a trademark licence running
-- the opposite way from ownership. Recording it here would be wrong twice, and
-- would invite exactly the manufacturer inference this column must not support:
-- true for HP5 Plus, false for Ilfocolor.
UPDATE "Brand" SET "parentBrandId" = 'brand_harman'   WHERE "id" = 'brand_kentmere';
UPDATE "Brand" SET "parentBrandId" = 'brand_fujifilm' WHERE "id" = 'brand_fujica';

-- ── Film stocks ────────────────────────────────────────────────────────────

ALTER TABLE "FilmStock" ADD COLUMN "brandId"               TEXT;
ALTER TABLE "FilmStock" ADD COLUMN "manufacturerStatus"    "ManufacturerStatus";
ALTER TABLE "FilmStock" ADD COLUMN "manufacturedByBrandId" TEXT;

-- Brand defaults to the old manufacturer text, then the rows where the two
-- differ are corrected below. Kentmere is the case that column could not hold.
UPDATE "FilmStock" SET "brandId" = CASE "manufacturer"
  WHEN 'Kodak'      THEN 'brand_kodak'
  WHEN 'Fujifilm'   THEN 'brand_fujifilm'
  WHEN 'Harman'     THEN 'brand_harman'
  WHEN 'Ilford'     THEN 'brand_ilford'
  WHEN 'Cinestill'  THEN 'brand_cinestill'
  WHEN 'Ferrania'   THEN 'brand_ferrania'
  WHEN 'Lomography' THEN 'brand_lomography'
  WHEN 'Lucky'      THEN 'brand_lucky'
  WHEN 'Orwo'       THEN 'brand_orwo'
  WHEN 'Yes!Star'   THEN 'brand_yesstar'
END;

UPDATE "FilmStock" SET "brandId" = 'brand_kentmere' WHERE "name" = 'Kentmere Pan 400';

-- Everything coats its own unless named below.
UPDATE "FilmStock" SET "manufacturerStatus" = 'SAME_AS_BRAND';

-- Confirmed to be made by another company.
UPDATE "FilmStock"
   SET "manufacturerStatus" = 'KNOWN', "manufacturedByBrandId" = 'brand_harman'
 WHERE "name" IN ('Ilford HP5 Plus 400', 'Kentmere Pan 400');

-- Cinestill 800T is Kodak Vision3 500T with the remjet removed. The stock
-- relationship itself is phase 3; this records only who coats the emulsion.
UPDATE "FilmStock"
   SET "manufacturerStatus" = 'KNOWN', "manufacturedByBrandId" = 'brand_kodak'
 WHERE "name" = 'Cinestill 800T';

-- Reported by credible sources, never officially confirmed. See
-- prisma/seed/manufacturer-attributions.json for the sourcing behind each.
UPDATE "FilmStock"
   SET "manufacturerStatus" = 'ATTRIBUTED', "manufacturedByBrandId" = 'brand_kodak'
 WHERE "name" IN ('Fujifilm 400', 'Lomography Color Negative 400', 'Yes!Star 400');

-- Nobody has established the coater.
--
-- The two Ilfocolor stocks are here because Ilford Imaging does not coat film
-- and has not said who does. Fujicolor 400 is a regional product distinct from
-- Fujifilm 400 above — same brand, different and unconfirmed origin, which is
-- the pair that makes the case against merging them. Superia Premium 400 is
-- simply unresearched, and unresearched is not the same as in-house.
UPDATE "FilmStock"
   SET "manufacturerStatus" = 'UNKNOWN', "manufacturedByBrandId" = NULL
 WHERE "name" IN (
   'Ilford IlfoColor 400 Plus',
   'Ilford Ilfocolor Vivid 400',
   'Fujicolor 400',
   'Fujifilm Superia Premium 400',
   'LomoChrome Color ''92 Sun-Kissed'
 );

ALTER TABLE "FilmStock" ALTER COLUMN "brandId"            SET NOT NULL;
ALTER TABLE "FilmStock" ALTER COLUMN "manufacturerStatus" SET NOT NULL;

ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_manufacturedByBrandId_fkey"
  FOREIGN KEY ("manufacturedByBrandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FilmStock_brandId_idx"               ON "FilmStock"("brandId");
CREATE INDEX "FilmStock_manufacturedByBrandId_idx" ON "FilmStock"("manufacturedByBrandId");

-- The status and the column agree, in both directions.
--
-- Without the "only if" half, a row could claim SAME_AS_BRAND while pointing at
-- someone else, and the page would have two answers to choose between.
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_manufacturer_status_matches_column"
  CHECK (
    ("manufacturerStatus" IN ('KNOWN', 'ATTRIBUTED') AND "manufacturedByBrandId" IS NOT NULL)
    OR
    ("manufacturerStatus" IN ('SAME_AS_BRAND', 'UNKNOWN') AND "manufacturedByBrandId" IS NULL)
  );

-- A brand that coats its own film is SAME_AS_BRAND, not KNOWN pointing at
-- itself. One representation per fact, so filters cannot miss half the rows.
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_manufacturer_differs_from_brand"
  CHECK ("manufacturedByBrandId" IS NULL OR "manufacturedByBrandId" <> "brandId");

-- ── Cameras ────────────────────────────────────────────────────────────────

ALTER TABLE "Camera" ADD COLUMN "brandId" TEXT;

-- Seventeen judgements, not a string split. The brand is folded into `name` on
-- sixteen rows and the split point is not uniform: FUJICA is a Fujifilm
-- sub-brand rather than a spelling variant, and the two disposables carry a
-- real brand in front of marketing copy.
UPDATE "Camera" SET "brandId" = CASE "name"
  WHEN 'Canon AE-1 Program'           THEN 'brand_canon'
  WHEN 'Canon Autoboy FXL'            THEN 'brand_canon'
  WHEN 'FUJICA ST605 II'              THEN 'brand_fujica'
  WHEN 'Fujifilm QuickSnap Flash 400' THEN 'brand_fujifilm'
  -- Yes!Star 400 Jam Camera is a real product; the brand is on the retailer
  -- listing, not only in this record's own description.
  WHEN 'Jam Camera'                   THEN 'brand_yesstar'
  WHEN 'Kodak Cameo Auto Focus QD'    THEN 'brand_kodak'
  WHEN 'Kodak FunSaver'               THEN 'brand_kodak'
  -- Kodak is the brand on the box. Who builds it under licence is a different
  -- question, and cameras have no manufacturer column yet.
  WHEN 'Kodak Snapic A1'              THEN 'brand_kodak'
  WHEN 'Konica K-mini'                THEN 'brand_konica'
  WHEN 'Lomography Sprocket Rocket'   THEN 'brand_lomography'
  WHEN 'Olympus 35 SP'                THEN 'brand_olympus'
  WHEN 'Olympus AF-1'                 THEN 'brand_olympus'
  WHEN 'Olympus Mju Zoom 105'         THEN 'brand_olympus'
  WHEN 'Olympus Mju-I'                THEN 'brand_olympus'
  WHEN 'Olympus Trip Panorama 2'      THEN 'brand_olympus'
  WHEN 'Pentax Espio 120'             THEN 'brand_pentax'
  WHEN 'Pentax Espio 120Mi'           THEN 'brand_pentax'
  ELSE NULL
END;

ALTER TABLE "Camera" ADD CONSTRAINT "Camera_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Camera_brandId_idx" ON "Camera"("brandId");
