-- Alternate names for the two bodies where the naming is externally sourced.
--
-- Olympus sold the mju range in North America as the Infinity line, so a body
-- catalogued under one name was unfindable to everyone who owns the other.
-- These two are confirmed on camera-wiki; their own descriptions said the same
-- thing, but a description written in-house is not a source.
--
-- Three other bodies state an alternate name in their descriptions and are
-- deliberately left empty: Mju Zoom 105, Espio 120 and K-mini. The naming
-- convention makes each of them plausible, and plausible is what this catalogue
-- is trying not to publish. They stay in the research backlog.
--
-- Provenance rows are written in the same statement, so these land cited rather
-- than bare.

UPDATE "Camera" SET "aliases" = ARRAY['Infinity Stylus', 'Olympus µ']
 WHERE "name" = 'Olympus Mju-I';

UPDATE "Camera" SET "aliases" = ARRAY['Infinity']
 WHERE "name" = 'Olympus AF-1';

INSERT INTO "FieldProvenance" ("entityType", "entityId", "fieldName", "source", "sourceUrl")
SELECT 'CAMERA'::"EntityType", "id", 'aliases', 'RESEARCH'::"ValueSource",
       'https://camera-wiki.org/wiki/Olympus_%C2%B5'
  FROM "Camera" WHERE "name" IN ('Olympus Mju-I', 'Olympus AF-1')
ON CONFLICT ("entityType", "entityId", "fieldName")
DO UPDATE SET "source" = EXCLUDED."source", "sourceUrl" = EXCLUDED."sourceUrl";
