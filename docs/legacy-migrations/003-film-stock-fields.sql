-- Film stock: process, color balance, manufacturer, aliases, multi-format.
--
-- Applied directly rather than through `prisma migrate deploy`, because this
-- repo's migration history predates the move to Postgres and cannot be
-- replayed. Every statement is idempotent, so re-running is harmless.
--
--   npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/sql/003-film-stock-fields.sql
--   npx tsx scripts/backfill-film-fields.ts --dry     # review
--   npx tsx scripts/backfill-film-fields.ts
--   npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/sql/004-film-process-not-null.sql   # only once clean
--
-- process is added NULLABLE here even though it is meant to be required. A
-- NOT NULL column has to be filled at the moment it is created, which would
-- mean guessing a value for every row inside the migration. The backfill runs
-- separately, reports what it could not determine, and 004 applies the
-- constraint once nothing is left unresolved.

-- Enum labels are the display strings, so a raw SELECT reads the way the UI
-- does. Prisma maps them to identifiers it can legally name.
DO $$ BEGIN
  CREATE TYPE "FilmProcess" AS ENUM ('C-41', 'E-6', 'ECN-2', 'B&W', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ColorBalance" AS ENUM ('Daylight', 'Tungsten', 'N/A');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "manufacturer" TEXT;
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "aliases" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "FilmStock" ADD COLUMN IF NOT EXISTS "colorBalance" "ColorBalance";

-- process: the existing column is free text and entirely null on this data, so
-- it is replaced rather than cast. Guarded on the current type so re-running
-- after the conversion is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'FilmStock' AND column_name = 'process' AND data_type = 'text'
  ) THEN
    ALTER TABLE "FilmStock" RENAME COLUMN "process" TO "process_legacy_text";
    ALTER TABLE "FilmStock" ADD COLUMN "process" "FilmProcess";

    -- Carry over anything already written in a recognized form.
    UPDATE "FilmStock" SET "process" = "process_legacy_text"::"FilmProcess"
    WHERE "process_legacy_text" IN ('C-41', 'E-6', 'ECN-2', 'B&W', 'Other');

    ALTER TABLE "FilmStock" DROP COLUMN "process_legacy_text";
  END IF;
END $$;

-- format: single value becomes an array, existing values wrapped. Same guard —
-- once converted, the column is no longer text and this block is skipped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'FilmStock' AND column_name = 'format' AND data_type = 'text'
  ) THEN
    ALTER TABLE "FilmStock"
      ALTER COLUMN "format" TYPE TEXT[]
      USING CASE
        WHEN "format" IS NULL OR btrim("format") = '' THEN '{}'::TEXT[]
        ELSE ARRAY[btrim("format")]
      END;
    ALTER TABLE "FilmStock" ALTER COLUMN "format" SET NOT NULL;
    ALTER TABLE "FilmStock" ALTER COLUMN "format" SET DEFAULT '{}';
  END IF;
END $$;

-- Browse filters narrow by process first, then color balance.
CREATE INDEX IF NOT EXISTS "FilmStock_process_idx" ON "FilmStock"("process");
CREATE INDEX IF NOT EXISTS "FilmStock_colorBalance_idx" ON "FilmStock"("colorBalance");
