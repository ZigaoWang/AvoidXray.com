# Database objects Prisma does not model

`schema.prisma` cannot express CHECK constraints, triggers, partial indexes or
functions. `prisma migrate diff` therefore returns clean whether these exist or
not, and a future migration that rebuilds a table drops them silently.

Everything here is defined in a migration file and asserted by
`prisma/tests/constraints.sql`, which CI runs against a database built from
`prisma/migrations`. **Adding an object to the database means adding it to both
this list and that test file**, otherwise nothing will ever notice it going
missing.

## CHECK constraints

| Constraint | Table | Rule | Migration |
|---|---|---|---|
| `FilmStock_mono_balance_not_applicable` | `FilmStock` | Monochrome film must have `colorBalance = 'N/A'`, exactly, not null | `20260904140000` |
| `FilmStock_colour_balance_not_na` | `FilmStock` | Colour film must not be `'N/A'`; null stays legal and means "not established" | `20260904140000` |
| `FilmStock_manufacturer_status_matches_column` | `FilmStock` | `KNOWN`/`ATTRIBUTED` require `manufacturedByBrandId`; `SAME_AS_BRAND`/`UNKNOWN` forbid it | `20260904160000` |
| `FilmStock_manufacturer_differs_from_brand` | `FilmStock` | A maker may not be the brand itself. That is `SAME_AS_BRAND` | `20260904160000` |
| `FilmStock_parent_is_not_self` | `FilmStock` | A stock cannot be respooled from itself | `20260904170000` |
| `FilmVariant_one_quantity_shape` | `FilmVariant` | At most one of exposures, sheet count, bulk length | `20260904180000` |
| `FilmVariant_sheets_have_no_exposures` | `FilmVariant` | Sheet formats are sold in boxes, not on rolls | `20260904180000` |
| `FieldProvenance_verified_has_verifier` | `FieldProvenance` | A verification records who did it, and only a verification may | `20260904190000` |
| `FieldProvenance_model_only_for_llm` | `FieldProvenance` | Model-written values name the model; other sources may not | `20260904190000` |
| `FieldProvenance_cited_sources_have_urls` | `FieldProvenance` | A cited source has a URL | `20260904190000` |
| `Revision_reviewed_has_reviewer` | `Revision` | A review records who did it, and only a review may | `20260905110000` |
| `Revision_pending_has_no_outcome` | `Revision` | Pending has decided nothing, so carries no outcome | `20260905110000` |
| `Revision_settled_is_reviewed` | `Revision` | A settled revision has been reviewed | `20260905110000` |
| `Revision_partial_has_both_outcomes` | `Revision` | A partial approval applied something and refused something | `20260905110000` |
| `Revision_payload_is_not_empty` | `Revision` | An edit changes something | `20260905110000` |
| `Revision_generated_values_are_cited` | `Revision` | A model-sourced proposal cites every field it proposes | `20260905110000` |
| `FilmStock_summary_length` | `FilmStock` | A summary is 20 to 200 characters, or null | `20260905120000` |
| `Camera_summary_length` | `Camera` | A summary is 20 to 200 characters, or null | `20260905120000` |

The two colour balance constraints are written with `IS [NOT] DISTINCT FROM`
rather than `=`. A CHECK passes when its expression evaluates to NULL, so
`colorBalance = 'N/A'` would let a monochrome row through with no balance at
all, which is the bug the first constraint exists to prevent.

## Facts asserted by test, with no constraint behind them

Some invariants cannot be expressed as a constraint but are still load-bearing.
`prisma/tests/constraints.sql` asserts them anyway, so a well-meaning change
fails CI rather than quietly producing wrong answers.

| Assertion | Why |
|---|---|
| `Brand.parentBrandId` is null for `brand_ilford` | Harman trades as Ilford Photo under a trademark licence from Ilford Imaging Europe, which owns the mark. The edge would run opposite to ownership, and would invite inferring Ilfocolor's maker as Harman: true for HP5 Plus, false for Ilfocolor. |

## Triggers

`FieldProvenance` is polymorphic, so it cannot have a foreign key to the four
tables it points at. Without cleanup, deleting a record leaves its provenance
behind for a future record reusing that id to inherit.

| Trigger | Table | Migration |
|---|---|---|
| `FilmStock_provenance_cleanup` | `FilmStock` | `20260904190000` |
| `FilmVariant_provenance_cleanup` | `FilmVariant` | `20260904190000` |
| `Camera_provenance_cleanup` | `Camera` | `20260904190000` |
| `Brand_provenance_cleanup` | `Brand` | `20260904190000` |
| `FilmStock_slug_not_retired` | `FilmStock` | `20260905150000` |
| `Camera_slug_not_retired` | `Camera` | `20260905150000` |

The last two stop a record claiming a slug that redirects somewhere else, which
would silently steal another entry's inbound links. Reclaiming a slug the same
record retired earlier is allowed, so going back to a former name takes its URL
back. Application code avoided this already; nothing enforced it.

Identity is the slug rather than the name. A unique index on a name is case and
whitespace sensitive, so two spellings of one product can coexist, which is
exactly the duplicate that had to be corrected by hand. The slug is normalized
before it is stored, so it catches the case a name cannot.

All four call one function, `delete_field_provenance()`, parameterised by entity
type through `TG_ARGV`. Four hand-written functions would be four places for the
same logic to drift. Adding an entity type means adding a trigger here and an
assertion in the test file.

## Expression indexes

| Index | Table | Purpose | Migration |
|---|---|---|---|
| `FilmVariant_sku_key` | `FilmVariant` | One row per real SKU, over `COALESCE` of the three quantity columns | `20260904180000` |

Postgres treats nulls as distinct in a unique index, so a plain index over those
columns would compare two rows that are both "same stock, same format, no sheet
count, no bulk length" and call them different. That describes every roll film,
so the plain version caught essentially nothing. `NULLS NOT DISTINCT` is the
modern spelling of this and needs Postgres 15.

Prisma cannot express an expression index and does not introspect this one, so it
produces no drift and is not declared in `schema.prisma`. That also means nothing
would notice it disappearing, which is why it is asserted in the test file.

## Functions

| Function | Used by | Migration |
|---|---|---|
| `delete_field_provenance()` | The four provenance cleanup triggers | `20260904190000` |
| `revision_every_field_is_cited()` | `Revision_generated_values_are_cited` | `20260905110000` |
| `reject_retired_slug()` | The two slug triggers above | `20260905150000` |

The second exists because a CHECK cannot contain a subquery and comparing two
JSON key sets needs one. It is `IMMUTABLE` and reads only its arguments, which
is what makes it legal inside a constraint.

## Scheduled removals

| Object | Replaced by | Remove after |
|---|---|---|
| `ModerationSubmission` | `Revision` | **2026-12-01** |

## Scheduled tightenings

| Column | Change | After |
|---|---|---|
| `FilmStock.summary`, `Camera.summary` | `NOT NULL` | the catalogue rewrite pass |

Nullable at introduction on purpose. Two cameras have no description to derive a
summary from, and writing forty summaries to satisfy a constraint is the failure
the constraint exists to prevent. The length cap applies now; the NOT NULL waits
until every record has one that was written rather than generated to fill a
column.

Read-only from the day `Revision` shipped: nothing new lands in it, so the
overlap ends rather than refilling. It still holds the proposed image for an
in-flight edit and a handful of already-resolved rows. Resolve what remains by
hand, then drop it in a contract migration. A table with no pending items and no
removal date is how a site ends up with two review screens for a year.

## Partial indexes

| Index | Table | Covers | Migration |
|---|---|---|---|
| `FieldProvenance_unverified_idx` | `FieldProvenance` | Rows where `verifiedAt IS NULL` | `20260904190000` |
| `Revision_pending_idx` | `Revision` | Rows where `status = 'PENDING'` | `20260905110000` |

Every question asked of the provenance table is a form of "what has nobody
checked", so the index covers only those rows and stays small as the verified
majority grows. Prisma cannot express a partial index.
