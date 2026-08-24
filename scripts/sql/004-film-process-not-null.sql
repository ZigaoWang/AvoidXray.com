-- Enforce that every film stock has a process.
--
-- Split from 003 deliberately. The constraint can only be applied once the
-- backfill has resolved every row, and the backfill needs judgement on the
-- ambiguous ones. Running this while nulls remain fails loudly with the count,
-- rather than inventing a value to satisfy the constraint.
--
--   npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/sql/004-film-process-not-null.sql
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing FROM "FilmStock" WHERE "process" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION
      'Refusing: % film stock(s) still have no process. Run scripts/backfill-film-fields.ts and set the ones it reports.', missing;
  END IF;
END $$;

ALTER TABLE "FilmStock" ALTER COLUMN "process" SET NOT NULL;
