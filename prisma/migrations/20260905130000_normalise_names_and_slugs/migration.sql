-- Formal product names, and slugs derived from them.
--
-- Four slugs were artifacts of informal entry rather than choices: a stock
-- entered as "HP5 Plus" kept that slug after its name was completed, one lost a
-- hyphen, one used a film code, one carried a stray letter. They are not short
-- forms anybody picked. Names come first because a slug regenerated from a
-- wrong name is a correct slug pointing at a wrong record.
--
-- Every retired slug goes into SlugHistory, so every existing link keeps
-- resolving and there is no reader cost to the change.

-- ── Names ──────────────────────────────────────────────────────────────────

-- The brand styles itself CineStill. The row was entered with the casing a
-- keyboard produces rather than the one on the box.
UPDATE "Brand"     SET "name" = 'CineStill' WHERE "id" = 'brand_cinestill';
UPDATE "FilmStock" SET "name" = 'CineStill 800T' WHERE "name" = 'Cinestill 800T';

-- "Jam Camera" is a model name with no maker attached. The product is sold as
-- a Yes!Star, which the brand mapping already established.
UPDATE "Camera" SET "name" = 'Yes!Star Jam Camera' WHERE "name" = 'Jam Camera';

-- ── Slugs ──────────────────────────────────────────────────────────────────
--
-- Recomputed from the name for every record where the two disagree. The
-- expression mirrors slugify() in src/lib/seo/slug.ts: the meaningful
-- substitutions first, then anything non-alphanumeric becomes a separator,
-- then leading, trailing and doubled separators collapse.
--
-- The film brand column is empty on every row, so entitySlug reduces to
-- slugify(name) here. Camera slugs already agree with their names and are left
-- alone; the brand-prefixing branch of entitySlug is therefore not exercised
-- and is deliberately not reimplemented in SQL.

CREATE OR REPLACE FUNCTION pg_temp.slugify(input TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(
                 replace(replace(replace(input, '+', '-plus'), '&', '-and-'), '×', 'x')
               ),
               '[^a-z0-9]+', '-', 'g'
             ),
             '(^-+|-+$)', '', 'g'
           ),
           '-{2,}', '-', 'g'
         );
$$ LANGUAGE sql IMMUTABLE;

-- Retire first, while the old value is still on the row.
INSERT INTO "SlugHistory" ("kind", "slug", "targetId")
SELECT 'film', "slug", "id" FROM "FilmStock"
 WHERE "slug" IS NOT NULL AND "slug" <> pg_temp.slugify("name")
ON CONFLICT DO NOTHING;

INSERT INTO "SlugHistory" ("kind", "slug", "targetId")
SELECT 'camera', "slug", "id" FROM "Camera"
 WHERE "slug" IS NOT NULL AND "slug" <> pg_temp.slugify("name")
ON CONFLICT DO NOTHING;

UPDATE "FilmStock" SET "slug" = pg_temp.slugify("name")
 WHERE "slug" IS DISTINCT FROM pg_temp.slugify("name");

UPDATE "Camera" SET "slug" = pg_temp.slugify("name")
 WHERE "slug" IS DISTINCT FROM pg_temp.slugify("name");
