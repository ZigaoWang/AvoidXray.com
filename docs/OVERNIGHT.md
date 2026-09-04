# Overnight run

Running log for an unattended session. Written for someone with no context.

Verification results are described rather than pasted. This repository is public
and a row count is stale within a week.

---

## Landed

### Phase 2, brands

Separates the brand a film is sold as from the company that coats it.

`Brand` is one table serving film and cameras both, with no `type` column,
because several brands are referenced from both sides and any such column would
immediately be wrong for one of them. `FilmStock.brandId` is required and
`Camera.brandId` is nullable, since not every camera has an identifiable brand
and null is a research item rather than a reason to invent one.

`ManufacturerStatus` carries four values. `ATTRIBUTED` was added during research:
a maker widely reported but never confirmed, which is common because contract
coating deals are usually undisclosed. Filing those as unknown discards real
information and filing them as known overstates it. The column is required and
undefaulted, because a default of `SAME_AS_BRAND` would re-assert the exact claim
these columns exist to stop making.

Two CHECK constraints hold the invariant: the status must agree with whether a
maker is named, in both directions, and a named maker may not be the brand
itself. Legacy text columns are retained, not dropped.

Verified against a clone of production and then in production: every stock has a
brand and a status, every camera resolves to a brand, and the only two ownership
edges are the two intended ones. Site returns 200 across the main pages.

**The drift check earned its keep.** The first deploy shouted that production did
not match `schema.prisma`. The migration wrote `ON DELETE RESTRICT` for the
manufacturer foreign key and Prisma assumes `SET NULL` for a nullable relation.
`RESTRICT` is correct: `SET NULL` would clear the maker while the status still
read `ATTRIBUTED`, violating the CHECK, so a brand delete would fail as a
confusing constraint error on an unrelated film instead of a clear foreign key
error. Production had the right behaviour throughout; only the schema file was
wrong.

### Phase 3, respool structure

`parentStockId` records that one stock is respooled or rebadged from another, and
`respoolNotes` records what was done to it. This names a product, which is a
different fact from `manufacturedByBrandId` naming a company. A respool has both.

No merges were performed. Research found that both proposed merges were wrong:
the two Ilfocolor rows are different films with different exposure counts and
different looks, and the two Fuji rows have different manufacturers. Two sourced
edits landed instead. One stock gained the part of its product name that
distinguishes it from its sibling, with its previous slug retired into
`SlugHistory` so existing links still resolve. One colour balance was filled from
a retailer source, having been deliberately left null earlier when the only
argument for it was that similar rows shared the value.

Verified on a clone: stock count unchanged, one respool link, one slug history
row, no orphaned parents.

---

## Decisions needed

### D1: `process` is single-valued and at least one stock needs two

A stock with no remjet can run in either C-41 or ECN-2. It is recorded as the one
it is sold as, with the alternate left to prose. Respooled cine film is the
fastest growing corner of the catalogue and most of it has this property, so this
will recur.

- Leave it scalar and keep alternates in prose. No work, not queryable.
- `processes` as an array alongside the scalar, expand and contract. Consistent
  with `format`, which is already an array. Recommended, but it touches every
  filter on the film index, so not something to start unattended.
- A separate `alternateProcesses` array beside the primary scalar. Keeps "what it
  is sold as" distinct from "what it can run in", which is a real distinction for
  pushing and cross processing.

### D2: new film stocks are created with an unknown manufacturer

The create endpoint sets `manufacturerStatus` to `UNKNOWN` for anything submitted
through the form, because the form collects one name and that name is the brand.
Nobody has said who coats it.

Honest, but noisy for the common case where the brand does coat its own film. The
alternative asserts a maker on every new row, which is the failure the column
exists to prevent.

- Keep it, and let the provenance backlog surface it. Recommended.
- Ask the question in the form, with the brand pre-selected and an explicit "not
  sure" option. This is the real fix and belongs with form work, not a migration.

### D3: em dashes and live data in existing docs and comments

The working standard forbids em dashes in anything a user reads and forbids live
data in documentation. Docs written earlier in this session violate both. Docs
have been corrected. Code comments across the repository still contain em dashes
in quantity, and sweeping them is a large mechanical diff touching many files.

- Sweep them in one commit, accepting a large diff that is easy to review because
  it is mechanical. Recommended.
- Leave existing comments and hold the line on new ones. Cheaper, but leaves the
  codebase visibly inconsistent, which is the thing the standard is against.

---

## Findings

The drift check is the first automated check in this project to catch a real
mismatch, and it caught a semantic difference in delete behaviour rather than a
missing column. That is the class of thing code review reliably misses.

The constraint test file now carries an assertion with no constraint behind it:
that one brand has no parent, because the obvious ownership edge is actually a
trademark licence running the opposite way. Encoding a research finding as an
executable guard means a well meaning future edit fails CI instead of silently
making a manufacturer attribution wrong. This pattern is worth reusing whenever
research concludes that something must *not* be added.

---

## Blocked

Nothing.
