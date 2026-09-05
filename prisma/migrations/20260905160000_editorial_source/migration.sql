-- House judgment as its own kind of provenance.
--
-- Cited and uncited are not the two states a catalogue entry has. A description
-- carries sourced claims and it carries characterisation: tonality being soft,
-- grain reading as texture, a camera being best treated as wide-to-normal.
-- Those are judgments in the site's voice. They are not gaps waiting for a
-- citation and they are not claims a source could settle.
--
-- Without a name for that, the completeness score eventually flags them as
-- uncited and someone either deletes a good sentence or bolts a citation onto
-- an opinion. Both are worse than the sentence.

ALTER TYPE "ValueSource" ADD VALUE IF NOT EXISTS 'EDITORIAL';
