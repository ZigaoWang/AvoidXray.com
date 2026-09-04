-- Splits `filmType` into the two independent axes it was conflating, and makes
-- the colour balance rule an invariant the database enforces.
--
-- `filmType` crushed chromaticity (colour vs monochrome) and polarity (negative
-- vs positive) into one enum, and both were then inferred from `process`. That
-- inference is wrong for films that exist and will be added:
--
--   Ilford XP2 Super 400   monochrome, developed C-41  -> "colour negative"
--   Fomapan R100 / Scala   monochrome AND positive     -> inexpressible
--
-- filmType is deliberately NOT dropped here. Its readers move across in a
-- later commit, and a dropped column with a bad backfill is unrecoverable.

CREATE TYPE "Chromaticity" AS ENUM ('COLOR', 'MONOCHROME');
CREATE TYPE "Polarity" AS ENUM ('NEGATIVE', 'POSITIVE', 'DIRECT_POSITIVE');

ALTER TABLE "FilmStock" ADD COLUMN "chromaticity" "Chromaticity";
ALTER TABLE "FilmStock" ADD COLUMN "polarity"     "Polarity";

-- Backfill.
--
-- This is inference from `process`, which is the reasoning this migration
-- exists to stop trusting. It is applied here only because all 23 existing
-- rows were read individually first and none of them is an exception: there is
-- no XP2, no monochrome slide and no positive stock in the catalogue. The
-- general rule is written out rather than hardcoded so it stays legible, but
-- its correctness rests on that reading, not on the rule.
UPDATE "FilmStock" SET "chromaticity" =
  CASE WHEN "process" = 'B&W' THEN 'MONOCHROME' ELSE 'COLOR' END::"Chromaticity";

UPDATE "FilmStock" SET "polarity" =
  CASE WHEN "process" = 'E-6' THEN 'POSITIVE' ELSE 'NEGATIVE' END::"Polarity";

ALTER TABLE "FilmStock" ALTER COLUMN "chromaticity" SET NOT NULL;
ALTER TABLE "FilmStock" ALTER COLUMN "polarity"     SET NOT NULL;

-- Both halves of the colour balance rule.
--
-- Monochrome must be exactly N/A. Written IS NOT DISTINCT FROM rather than =
-- because a CHECK passes when its expression is NULL, so `= 'N/A'` would let a
-- monochrome row through with no balance at all.
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_mono_balance_not_applicable"
  CHECK ("chromaticity" <> 'MONOCHROME' OR "colorBalance" IS NOT DISTINCT FROM 'N/A');

-- Colour must not be N/A, so "not applicable" cannot leak onto a colour film.
-- NULL stays legal here: it means nobody has established the balance yet, which
-- is the honest state of Orwo Wolfen NC400 and is a research backlog item
-- rather than something to guess at.
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_colour_balance_not_na"
  CHECK ("chromaticity" <> 'COLOR' OR "colorBalance" IS DISTINCT FROM 'N/A');
