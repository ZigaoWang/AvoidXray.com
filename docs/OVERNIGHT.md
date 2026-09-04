# Overnight run

Running log. Written for someone with no context on the session.

---

## Landed

### Phase 2 — brands · `d3124dd`, `2c8c8ef`

Separates the brand a film is sold as from the company that coats it.

- `Brand` table, 16 rows, one table serving film and cameras both. Six brands are
  referenced from both sides, which is why there is no `type` column on it.
- `ManufacturerStatus` with four members. `ATTRIBUTED` is the addition from the
  research doc: a maker widely reported but never confirmed. Required and
  undefaulted — a default of `SAME_AS_BRAND` would re-assert the exact claim
  these columns exist to stop making.
- `FilmStock.brandId` NOT NULL, `Camera.brandId` nullable.
- Two CHECK constraints: status must agree with whether a maker is named, in both
  directions; and a maker may not be the brand itself.
- Legacy `FilmStock.manufacturer` and `Camera.brand` retained, not dropped.

**Verification, in production:**

```
films with no brand    0      SAME_AS_BRAND  12
films with no status   0      UNKNOWN         5
cameras with no brand  0      KNOWN           3
brands                16      ATTRIBUTED      3
ownership edges        2
```

Ownership edges are Kentmere→Harman and Fujica→Fujifilm. Ilford deliberately has
none. Site returns 200 on `/`, `/films`, `/cameras`.

**The drift check earned its keep.** First deploy shouted that production did not
match `schema.prisma`: the migration wrote `ON DELETE RESTRICT` for the
manufacturer FK, and Prisma assumes `SET NULL` for a nullable relation. `RESTRICT`
is correct — `SET NULL` would clear the maker while the status still read
`ATTRIBUTED`, violating the CHECK, so a brand delete would fail with a confusing
constraint error on an unrelated film instead of a clear FK error. Fixed in
`2c8c8ef`; production had the right behaviour throughout, only the schema file
was wrong.

---

## Decisions needed

### D1 — `process` is single-valued and at least one stock needs two

Orwo Wolfen NC400 carries no remjet and runs in **either C-41 or ECN-2**.
Recorded as C-41, which is how it is sold for still photography, with the ECN-2
compatibility left for the description.

Cinestill 800T is arguably the same shape: sold as C-41, sourced from an ECN-2
stock. As the catalogue grows, respooled cine film is the fastest-growing corner
of it and most of it has this property.

- **Option A** — leave scalar, note alternates in prose. Zero work, and the
  information is not queryable.
- **Option B** — `processes FilmProcess[]`, expand-and-contract alongside the
  scalar. Consistent with `format` already being an array. *Recommended*, but it
  touches every filter on `/films`, so not something to start unattended.
- **Option C** — separate `alternateProcesses` array beside the primary scalar.
  Keeps "what it is sold as" distinct from "what it can run in", which is a real
  distinction for pushing and cross-processing.

Not started. Logged rather than guessed.

### D2 — new film stocks are created as `UNKNOWN`

`/api/filmstocks` sets `manufacturerStatus: 'UNKNOWN'` for anything submitted
through the form, because the form collects one name and that name is the brand;
nobody has said who coats it.

This is honest but noisy: someone adding Kodak Gold 200 gets `UNKNOWN` when
`SAME_AS_BRAND` is almost certainly right. The alternative asserts a maker on
every new row, which is the failure this column exists to prevent.

- **Option A** — keep `UNKNOWN`, let the phase 5 backlog surface it. *Recommended.*
- **Option B** — ask the question in the form: "who makes it?" with the brand
  pre-selected and an explicit "not sure" option.

Option B is the real fix and belongs with the form work, not with a migration.

---

## Findings

- **Phase 2's drift catch is the first time an automated check has caught a real
  mismatch in this project.** Worth noting that it caught a *semantic* difference
  — delete behaviour — not a missing column, which is the class of thing code
  review reliably misses.
- **`prisma/tests/constraints.sql` now has 14 assertions**, including one with no
  constraint behind it: that Ilford has no `parentBrandId`. That encodes a
  research finding as an executable guard, so a well-meaning future edit adding
  the "obvious" Ilford→Harman edge fails CI instead of silently making
  Ilfocolor's maker wrong.

---

## Blocked

Nothing.
