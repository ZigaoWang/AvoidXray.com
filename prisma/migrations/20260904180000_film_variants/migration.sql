-- Splits the buyable version of a film out of the product line.
--
-- A product line is not a product. One emulsion is sold in several gauges at
-- several exposure counts, and holding format and exposure count on the stock
-- forces every multi-format film to pick one and pretend the rest do not exist.
--
-- The catalogue is single-format throughout today, so this creates one variant
-- per stock and fixes nothing immediately. It is worth doing now because it is
-- mechanical now and contested later, once stocks carry several formats each.
--
-- FilmStock.format and FilmStock.exposures are retained and still read by the
-- pages. They are dropped in a later migration, after the readers move.

CREATE TYPE "FilmFormat" AS ENUM (
  '35mm', '120', '220', '110', '126', '127',
  'instant', '4x5', '5x7', '8x10', 'bulk-35mm'
);

CREATE TABLE "FilmVariant" (
  "id"               TEXT NOT NULL,
  "filmStockId"      TEXT NOT NULL,
  "format"           "FilmFormat" NOT NULL,
  "exposures"        INTEGER,
  "sheetCount"       INTEGER,
  "bulkLengthM"      DECIMAL(5,1),
  "productCode"      TEXT,
  "discontinuedYear" INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FilmVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FilmVariant_filmStockId_fkey" FOREIGN KEY ("filmStockId")
    REFERENCES "FilmStock"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FilmVariant_filmStockId_idx" ON "FilmVariant"("filmStockId");
CREATE INDEX "FilmVariant_format_idx"      ON "FilmVariant"("format");

-- One row per real SKU.
--
-- Over COALESCE rather than the bare columns, because Postgres treats nulls as
-- distinct in a unique index. A plain index here would compare two rows that are
-- both "same stock, same format, no sheet count, no bulk length" and call them
-- different, which is every roll film in the catalogue: it would catch
-- essentially no duplicates at all. NULLS NOT DISTINCT is the modern spelling
-- and needs Postgres 15; the server runs 14.
--
-- Prisma cannot express an expression index, so this is invisible to the ORM and
-- is recorded in docs/db-objects.md and asserted in prisma/tests/constraints.sql.
-- The sentinels are negative, which no real quantity is.
CREATE UNIQUE INDEX "FilmVariant_sku_key" ON "FilmVariant" (
  "filmStockId",
  "format",
  COALESCE("exposures", -1),
  COALESCE("sheetCount", -1),
  COALESCE("bulkLengthM", -1)
);

-- A variant is one shape or another, never two at once: a roll has exposures, a
-- box of sheets has a sheet count, a bulk roll has a length.
ALTER TABLE "FilmVariant" ADD CONSTRAINT "FilmVariant_one_quantity_shape"
  CHECK (
    (CASE WHEN "exposures"   IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "sheetCount"  IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "bulkLengthM" IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

-- Sheet formats are sold in boxes, not on rolls.
ALTER TABLE "FilmVariant" ADD CONSTRAINT "FilmVariant_sheets_have_no_exposures"
  CHECK ("format" NOT IN ('4x5', '5x7', '8x10') OR "exposures" IS NULL);

-- One variant per existing stock, from the format and exposure count it already
-- carries. Stocks with no recorded format get a 35mm variant, because every row
-- in this catalogue is 35mm and the column being empty is a gap in the record
-- rather than evidence of another gauge. Exposure count is carried across as-is,
-- including where it is null, which stays a research item.
INSERT INTO "FilmVariant" ("id", "filmStockId", "format", "exposures")
SELECT
  'variant_' || "id",
  "id",
  COALESCE(("format")[1], '35mm')::"FilmFormat",
  CASE WHEN "exposures" ~ '^[0-9]+$' THEN "exposures"::INTEGER ELSE NULL END
FROM "FilmStock";
