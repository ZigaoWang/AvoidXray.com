-- Records that one stock is respooled or rebadged from another, and applies the
-- two sourced edits that came out of the phase 2 research.
--
-- NO MERGES. The research found that both proposed merges were wrong: the two
-- Ilfocolor rows are different products (24 vs 36 exposures, different looks),
-- and Fujifilm 400 and Fujicolor 400 have different manufacturers. Merging is
-- irreversible and neither was justified. See docs/phase2-research.md.

ALTER TABLE "FilmStock" ADD COLUMN "parentStockId" TEXT;
ALTER TABLE "FilmStock" ADD COLUMN "respoolNotes"  TEXT;

ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_parentStockId_fkey"
  FOREIGN KEY ("parentStockId") REFERENCES "FilmStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FilmStock_parentStockId_idx" ON "FilmStock"("parentStockId");

-- A stock cannot be respooled from itself.
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_parent_is_not_self"
  CHECK ("parentStockId" IS NULL OR "parentStockId" <> "id");

-- The relationship the catalogue could not previously express, and both ends of
-- it are already rows here.
UPDATE "FilmStock" SET
  "parentStockId" = (SELECT id FROM "FilmStock" WHERE name = 'Kodak Vision3 500T'),
  "respoolNotes"  = 'Kodak Vision3 500T with the remjet backing removed, which is what allows it to run in C-41 rather than ECN-2. Removing the remjet is also what produces the halation around highlights the stock is known for.'
WHERE name = 'Cinestill 800T';

-- ── Sourced edits ──────────────────────────────────────────────────────────

-- Ilfocolor 400 Plus is "Vintage Tone", which is part of the product name and
-- the thing that distinguishes it from Ilfocolor Vivid 400 — a genuinely
-- different film at 36 exposures rather than 24. The casing is corrected to
-- match the manufacturer's own store. The Vivid row already reads correctly.
--
-- The old slug is retired into SlugHistory first, so every existing link to the
-- page keeps resolving. This is what that table is for.
INSERT INTO "SlugHistory" ("kind", "slug", "targetId")
SELECT 'film', "slug", "id" FROM "FilmStock"
 WHERE "name" = 'Ilford IlfoColor 400 Plus' AND "slug" IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "FilmStock"
   SET "name" = 'Ilford Ilfocolor 400 Plus Vintage Tone',
       "slug" = 'ilford-ilfocolor-400-plus-vintage-tone'
 WHERE "name" = 'Ilford IlfoColor 400 Plus';

-- Orwo Wolfen NC400's colour balance, filled from a source rather than inferred.
--
-- It was deliberately left null when the only argument for Daylight was that the
-- other twenty C-41 rows are daylight. It is now sourced to retailer listings,
-- so it can be filled. Null, then research, then a sourced fill — that cycle is
-- the point, and it is not the same thing as guessing.
UPDATE "FilmStock" SET "colorBalance" = 'Daylight'
 WHERE "name" = 'Orwo Wolfen NC400' AND "colorBalance" IS NULL;
