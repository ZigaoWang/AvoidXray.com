-- Revision_decided_has_time, added one migration ago, restates a rule this
-- table already had: Revision_settled_is_reviewed is the same predicate under
-- an older and better name. Two constraints saying one thing is two things to
-- keep in step, and the pair would have disagreed the first time either was
-- edited.

ALTER TABLE "Revision" DROP CONSTRAINT "Revision_decided_has_time";
