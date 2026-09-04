# Overnight run

Running log for an unattended session. Written for someone with no context.

Verification results are described rather than pasted. This repository is public
and a row count is stale within a week.

---

## Summary

Phases 2 through 5 landed and are live. Each was tested against a clone of
production before deploying, verified in production afterwards, and committed
separately so any one can be reverted on its own. Nothing irreversible was done:
no merges, no deletions, no dropped columns. Every legacy column still sits
beside its replacement.

The catalogue can now say things it could not say before. A brand is separate
from the company that coats the film, with four levels of confidence about who
that is. A respool points at the stock it came from. A buyable version of a film
is separate from the product line. And every stored value records where it came
from, which turns "what has nobody checked" from a guess into a query.

Three things need a decision, listed below. Two research documents and one
extraction proposal are on disk but deliberately not committed, since they are
working notes rather than documentation of the system.

**Site state:** healthy. Main pages return 200, CI is green, migrations and the
schema agree, and the post-deploy drift check is quiet.

**What I would do next:** the revisions pipeline, which was held back on purpose
because it rewrites the moderation flow and wants review before it is built. The
lens work has enough extracted material to be worth starting after that.

---

## Landed

### Phase 2, brands

Separates the brand a film is sold as from the company that coats it.

`Brand` is one table serving film and cameras both, with no `type` column,
because several brands are referenced from both sides and any such column would
immediately be wrong for one of them. A film's brand is required; a camera's is
nullable, since not every camera has an identifiable brand and null is a
research item rather than a reason to invent one.

`ManufacturerStatus` carries four values. `ATTRIBUTED` was added during research:
a maker widely reported but never confirmed, which is common because contract
coating deals are usually undisclosed. Filing those as unknown discards real
information and filing them as known overstates it. The column is required and
undefaulted, because a default of same-as-brand would re-assert the exact claim
these columns exist to stop making.

Two CHECK constraints hold the invariant: the status must agree with whether a
maker is named, in both directions, and a named maker may not be the brand
itself.

**The drift check earned its keep.** The first deploy shouted that production did
not match the schema file. The migration wrote `ON DELETE RESTRICT` for the
manufacturer foreign key and Prisma assumes `SET NULL` for a nullable relation.
`RESTRICT` is correct: `SET NULL` would clear the maker while the status still
read attributed, violating the CHECK, so a brand delete would fail as a confusing
constraint error on an unrelated film instead of a clear foreign key error.
Production had the right behaviour throughout; only the schema file was wrong.

### Phase 3, respool structure

`parentStockId` records that one stock is respooled or rebadged from another, and
`respoolNotes` records what was done to it. This names a product, which is a
different fact from naming a company. A respool has both.

No merges were performed. Research found both proposed merges were wrong: two
rows treated as a casing typo are different films with different exposure counts
and different looks, and two others share a brand but have different
manufacturers. Two sourced edits landed instead. One stock gained the part of its
product name that distinguishes it from its sibling, with its previous slug
retired so existing links still resolve. One colour balance was filled from a
retailer source, having been left null earlier when the only argument for it was
that similar rows shared the value.

### Phase 4, film variants

A product line is not a product. One emulsion is sold in several gauges at
several exposure counts, and holding format and exposure count on the stock
forces every multi-format film to pick one and pretend the rest do not exist.

The catalogue is single-format throughout, so this fixes nothing today. It is
worth doing now because it is mechanical now and contested later.

**Writing the test found a real defect in my own work.** The first version used a
plain unique index across the stock, format and three quantity columns. Postgres
treats nulls as distinct, so two rows that are both "same stock, same format, no
sheet count, no bulk length" do not collide, and that describes every roll film:
the index caught essentially nothing. It is now an index over `COALESCE` of the
three quantity columns. `NULLS NOT DISTINCT` is the modern spelling and needs
Postgres 15.

**A second finding came out of the same bug.** CI was running a newer Postgres
major version than production, which is how the first version of this migration
passed locally and failed on the server. CI is now pinned to the version
production actually runs. Confirmed the pin went CI down to production, not the
reverse, and confirmed on the live server that the index rejects a duplicate.

### Phase 5, provenance

One row per field per record, saying where that field's value came from.

Existing values backfill as `IMPORT`, not `USER`. `USER` would assert a
contributor entered them, which nobody knows: some came through forms, some from
an administrator, and some descriptions were drafted with model assistance.
`IMPORT` says only what is true, that they predate this table. The manufacturer
attributions researched during phase 2 land with their source URLs instead.

Three CHECKs keep it honest: a verification names its verifier, a model-written
value names the model so a bad batch can be found and requeued, and a cited
source has a URL. Cleanup is one trigger function parameterised by entity type
rather than one per table, since polymorphic rows cannot have a foreign key and
four copies of the same logic is four places to drift.

Each new constraint and the trigger were verified to fail the test suite when
dropped, individually. That check found a bug in the verification script itself
before it found anything else.

### Copy cleanup

Em dashes, marketing words and an exclamation mark removed from strings, alt
text, metadata and error messages. Code comments untouched, by decision. Empty
admin table cells now read "Not set" rather than a dash.

---

## Decisions needed

### D1: `process` is single-valued and at least one stock needs two

A stock with no remjet can run in either of two processes. It is recorded as the
one it is sold as, with the alternate left to prose. Respooled cine film is the
fastest growing corner of the catalogue and most of it has this property, so this
will recur.

- Leave it scalar and keep alternates in prose. No work, not queryable.
- An array alongside the scalar, expand and contract. Consistent with format,
  which is already an array. Recommended, but it touches every filter on the film
  index, so not something to start unattended.
- A separate alternates array beside the primary scalar. Keeps "what it is sold
  as" distinct from "what it can run in", which is a real distinction for pushing
  and cross processing.

### D2: new film stocks are created with an unknown manufacturer

The create endpoint records the manufacturer as unknown for anything submitted
through the form, because the form collects one name and that name is the brand.
Nobody has said who coats it.

Honest, but noisy for the common case where the brand does coat its own film. The
alternative asserts a maker on every new row, which is the failure the column
exists to prevent.

- Keep it, and let the provenance backlog surface it. Recommended.
- Ask the question in the form, with the brand pre-selected and an explicit "not
  sure" option. This is the real fix and belongs with form work, not a migration.

### D3: cameras have no aliases column

Film stocks and brands both have one and search already reads it. Five cameras
are sold under a different name in another market, and their descriptions say so,
so those records are currently unfindable under the name half their owners use.

Small additive change, no risk. Not done because it is a feature rather than part
of a migration phase, and it wants the search behaviour checked alongside it.

---

## Findings

**A search summary asserted a manufacturing claim that its own sources
contradict.** While researching a flagged film, the summary stated confidently
that it is made in a particular country by the brand itself. Fetching the pages
showed one source explicitly saying the opposite and the rest not addressing it.
The existing unknown value was correct and stays. This matters well beyond the
one row: any future automated writer proposing values from search results will
hit exactly this, and it is the concrete argument for requiring a citation per
field and for reading the citation rather than the summary.

**Two of three camera years could not be sourced.** All three are stated in the
records' own descriptions. One was confirmed externally and is proposed; the
other two stay null. Filling all three from the descriptions would have produced
three values that looked equally sourced.

**The constraint test file now carries assertions with no constraint behind
them.** One records that a particular brand must not be given a parent, because
the obvious ownership edge is really a trademark licence running the opposite
way. Encoding a research finding as an executable guard means a well meaning
future edit fails CI instead of silently making an attribution wrong. Worth
reusing whenever research concludes that something must *not* be added.

**Two bugs tonight were in verification code, not production code.** The variant
uniqueness test and the constraint-drop script were both wrong in ways that made
them pass when they should have failed. Tests that cannot fail are the quiet
failure mode here, and every assertion added tonight was checked by deliberately
breaking the thing it guards.

---

## Not committed, on disk only

Working notes rather than documentation of the system, kept out of the public
repository:

- `docs/research-findings.md`, sourced proposals for null fields
- `docs/lens-extraction.md`, lens specifications extracted from camera
  descriptions, with the source sentence quoted beside each value
- `docs/data-model-plan.md` and `CONTRIBUTING.md`, from earlier

The lens extraction is the useful one. Several descriptions contain full lens
specifications in prose, one of them giving focal range, both maximum apertures,
element and group counts and minimum focus distance in a single sentence. One
camera names its mount. That is enough to start the lens phase against real
extracted values rather than an empty table.

---

## Blocked

Nothing.
