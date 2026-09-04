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

None yet. The polymorphic tables in phases 5 and 6 (`FieldProvenance`,
`Revision`) cannot use foreign keys, so deleting a film stock will need a
trigger to remove its dependent rows. Those are more easily lost than a CHECK
and belong in this table when they land.

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

## Partial indexes

None yet. Phase 7 adds `photos (film_stock_id) WHERE status = 'published'` and
its camera equivalent.
