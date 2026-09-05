-- A short summary, separate from the description.
--
-- Search results and link previews truncated the description and cut
-- mid-clause. Writing descriptions that survive truncation is the wrong fix: it
-- constrains every description forever to serve a job only its first sentence
-- was doing. A separate field lets each do one thing, and it strengthens the
-- rule against restating specs, because the summary absorbs the identifying
-- sentence and the description stops wanting to repeat it.
--
-- Nullable, for now. It should be required and will be, but two cameras have no
-- description at all, so there is nothing to derive a summary from. Inventing
-- forty summaries to satisfy a constraint is the exact failure the constraint
-- exists to prevent. The NOT NULL follows the rewrite pass; the date is
-- recorded in docs/db-objects.md.
--
-- The cap is enforced here rather than in a form. An unconstrained summary
-- becomes a second description within twenty entries.

ALTER TABLE "FilmStock" ADD COLUMN "summary" TEXT;
ALTER TABLE "Camera"    ADD COLUMN "summary" TEXT;

-- Twenty characters is not a summary, and two hundred is not one or two
-- sentences any more. Null stays legal until the pass has run.
ALTER TABLE "FilmStock" ADD CONSTRAINT "FilmStock_summary_length"
  CHECK ("summary" IS NULL OR char_length("summary") BETWEEN 20 AND 200);

ALTER TABLE "Camera" ADD CONSTRAINT "Camera_summary_length"
  CHECK ("summary" IS NULL OR char_length("summary") BETWEEN 20 AND 200);
