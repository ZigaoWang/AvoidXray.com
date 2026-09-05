-- Identity is the slug, not the raw name.
--
-- A plain unique index on a name is case and whitespace sensitive, so
-- "Cinestill 800T" and "CineStill 800T" are different values to Postgres and
-- both could exist at once. That is exactly the duplicate that had to be fixed
-- by hand, and the constraint added alongside it would not have caught it.
--
-- The slug is already normalized: lowercased, punctuation collapsed, trimmed.
-- Two names that differ only in casing or spacing produce the same slug, so
-- making the slug the unique identity catches the case a name cannot.
--
-- The name unique goes. It was doing a job it could not do, and keeping both
-- would reject legitimate distinct products that happen to share a name across
-- brands, which the slug handles by carrying the brand.

DROP INDEX IF EXISTS "Camera_name_key";

-- Already unique on both tables; stated here so the intent is in one place.
-- FilmStock.slug and Camera.slug carry UNIQUE from the baseline.

-- A retired slug cannot be handed to a different record.
--
-- Nothing enforced this: retireSlug avoids it in application code, but a new
-- entity created through any other path could claim a slug that redirects
-- elsewhere and silently steal its inbound links. The check is a trigger rather
-- than a foreign key because the rule spans two tables in the wrong direction.
CREATE OR REPLACE FUNCTION reject_retired_slug() RETURNS TRIGGER AS $$
DECLARE
  owner TEXT;
  -- Prefixed because an unprefixed name here is ambiguous against the column
  -- of the same name in SlugHistory, which plpgsql resolves to the column.
  v_kind TEXT := CASE TG_TABLE_NAME WHEN 'FilmStock' THEN 'film' ELSE 'camera' END;
BEGIN
  IF NEW."slug" IS NULL THEN RETURN NEW; END IF;

  SELECT "targetId" INTO owner FROM "SlugHistory"
   WHERE "kind" = v_kind AND "slug" = NEW."slug";

  -- Reclaiming a slug this same record retired earlier is allowed: going back
  -- to a former name should take its URL back rather than invent a suffix.
  IF owner IS NOT NULL AND owner <> NEW."id" THEN
    RAISE EXCEPTION 'slug % is retired and redirects to %', NEW."slug", owner
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FilmStock_slug_not_retired"
  BEFORE INSERT OR UPDATE OF "slug" ON "FilmStock"
  FOR EACH ROW EXECUTE FUNCTION reject_retired_slug();

CREATE TRIGGER "Camera_slug_not_retired"
  BEFORE INSERT OR UPDATE OF "slug" ON "Camera"
  FOR EACH ROW EXECUTE FUNCTION reject_retired_slug();
