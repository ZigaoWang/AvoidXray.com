-- The summary column goes. The sentence it held stays, at the front of the
-- description.
--
-- Two columns holding one piece of writing is what caused every bug around
-- them. A summary was derived from its description once, at creation, and the
-- two then drifted, because the edit form only ever showed the description: the
-- sentence a reader sees first was not in the box anyone was editing. The pages
-- derive the lead sentence from the description instead now --
-- summaryFromDescription() in src/lib/catalogForm.ts -- and nothing has read or
-- written the column since. A field nothing writes cannot drift from the one it
-- was copied from.
--
-- The fold is done here rather than left to a one-off script so a deploy cannot
-- reach the DROP with writing still stranded in a column about to disappear.
-- Idempotent: a row whose description already opens with its summary -- the
-- common case, since that opening line is where the summary came from -- is
-- left alone.

UPDATE "FilmStock"
SET "description" = CASE
      WHEN coalesce(btrim("description"), '') = '' THEN btrim("summary")
      ELSE btrim("summary") || E'\n\n' || btrim(replace("description", E'\r\n', E'\n'))
    END
WHERE coalesce(btrim("summary"), '') <> ''
  AND btrim(split_part(btrim(replace(coalesce("description", ''), E'\r\n', E'\n')), E'\n', 1))
      IS DISTINCT FROM btrim("summary");

UPDATE "Camera"
SET "description" = CASE
      WHEN coalesce(btrim("description"), '') = '' THEN btrim("summary")
      ELSE btrim("summary") || E'\n\n' || btrim(replace("description", E'\r\n', E'\n'))
    END
WHERE coalesce(btrim("summary"), '') <> ''
  AND btrim(split_part(btrim(replace(coalesce("description", ''), E'\r\n', E'\n')), E'\n', 1))
      IS DISTINCT FROM btrim("summary");

-- The acceptance check, and the reason to trust the fold: every page must print
-- the same sentence afterwards as it does now. The lead sentence is the
-- description's first line, so every summary that still exists has to be that
-- line. A summary holding a line break is the one shape that cannot satisfy it,
-- and it stops the migration rather than losing the text -- the whole file is
-- one transaction, so nothing above has landed either.
DO $$
DECLARE stranded int;
BEGIN
  SELECT count(*) INTO stranded FROM (
    SELECT "summary", "description" FROM "FilmStock"
    UNION ALL
    SELECT "summary", "description" FROM "Camera"
  ) t
  WHERE coalesce(btrim(t."summary"), '') <> ''
    AND btrim(split_part(btrim(replace(coalesce(t."description", ''), E'\r\n', E'\n')), E'\n', 1))
        IS DISTINCT FROM btrim(t."summary");

  IF stranded > 0 THEN
    RAISE EXCEPTION
      '% row(s) hold a summary that is not the opening line of their description; dropping the column would lose it',
      stranded;
  END IF;
END $$;

-- Dropping a column takes its CHECK with it. Both are named anyway, because
-- docs/db-objects.md inventories these by name and an object leaving the
-- database unannounced is exactly what that inventory exists to catch.
ALTER TABLE "FilmStock" DROP CONSTRAINT "FilmStock_summary_length";
ALTER TABLE "Camera"    DROP CONSTRAINT "Camera_summary_length";

ALTER TABLE "FilmStock" DROP COLUMN "summary";
ALTER TABLE "Camera"    DROP COLUMN "summary";
