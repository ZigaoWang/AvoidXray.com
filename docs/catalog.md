# Catalog

Every film stock and camera has a page built from the community's photos, plus
a record of facts about it. The facts are held to a standard: a blank field is
better than a guess, because a wrong value looks authoritative and nobody
corrects it.

## The records

**Film stocks** have a process, chromaticity (color or monochrome) and polarity
(negative or positive) as separate required fields. They replaced a single film
type, which could not describe XP2 Super (monochrome, developed in C-41) or
Scala (monochrome positive). Required with no default, because a default would
quietly assert something about the film.

Who makes a film is recorded as one of four states: the brand itself, a known
maker, a maker that is reported but not confirmed, or unknown. CHECK constraints
keep the state and the maker column consistent. Respools point at their parent
stock; CineStill 800T points at Vision3 500T.

**Cameras** have a body type (the mechanism), a native frame format and typed
spec columns: focal range in millimeters (a prime stores the same number twice),
maximum apertures, element and group counts, closest focus, focus and metering
type, exposure modes, shutter range in seconds, film speed range, flash, battery
and weight.

**Brands** are one table for both, with no type column. Whether a brand makes
film, cameras or both follows from what points at it. A parent brand records
ownership only, so Ilford does not point at Harman, which licenses the name.

Label maps for every enum are typed `Record<Enum, string>`, so a value without a
label does not compile. Pages render only the values that exist.

## Edits go through revisions

Nothing writes to a film or camera directly. Every change, from a contributor's
suggestion, a research script or an admin, is a `Revision`
(`src/lib/revisions.ts`):

1. `submitRevision` records the proposed fields, their citations and the
   record's `version` at the time. Nothing changes on the record.
2. An admin reviews it field by field in `/admin/revisions`, or accepts all.
   Refusing a field requires a reason, which later proposals are judged against.
3. `reviewRevision` applies the accepted fields in one transaction: the record,
   its `version` bump and one `FieldProvenance` row per field.

Rules enforced on the way:

- **Stale proposals are held back.** If the record's version moved since the
  proposal was drafted, nothing is applied and the queue says so.
- **Citations follow their words.** When a description is reworded, a citation
  whose sentence is gone is dropped and reported, rather than left attached to
  text it never supported.
- **Only allowlisted fields can be written**, the same list the admin forms use.
- **An admin's own edit** is a revision submitted and approved in one step
  (`applyAdminEdit`), so history is written even for quick fixes.

Five CHECK constraints on `Revision` back this up in the database, including one
that refuses a model-generated proposal unless every field is cited.

## Provenance

`FieldProvenance` records, per field, where the value came from: import, user,
admin, research, datasheet, model or house voice. A cited claim keeps the URL
and the passage from the source that supports it, so it can be checked without
opening the link. Research and datasheet sources require a URL; a field with no
URL is recorded as editorial instead.

Readers never see this. Citations are for whoever maintains the catalog, not a
badge on every spec.

## Research loaders

Catalog copy is data, so it is never committed. The loaders in `scripts/` are
code; the batches they load are gitignored in `scripts/rewrite/`.

- **`load-research.ts`** submits researched fields and descriptions as
  revisions. It refuses an entry with an unsourced claim, a source with no
  passage, a retailer as the source, a passage that repeats our own sentence,
  or an enum value the column does not accept. `passageSupports` then checks
  that the passage visibly states the value, in the source's own wording:
  "24×36" for full frame, "lens shutter" for leaf, "CN-16" for C-41, meters for
  millimeters. A value it cannot find in the passage is dropped, not loaded.
- **`rewrite-pass.ts`** submits rewritten descriptions with a citation per
  paragraph.
- **`revoice-pass.ts`** rewrites tone without adding facts, and rejects
  marketing words, unattributed superlatives and em dashes.
- **`research-brief.ts`** generates the list of gaps from the database.
- **`audit-catalog-prose.ts`** lists descriptions that are too short or too long.

## Contributions

Signed-in users can suggest edits to any film or camera; field changes become a
`USER` revision. A proposed image is a file rather than a field, so it goes to
`/admin/moderation` instead. New gear is checked against existing names with a
similarity threshold that treats differing numbers as different products, so
"Gold 200" and "Gold 800" are not flagged as duplicates.

Community notes sit on gear pages. Posting one requires having uploaded a photo
shot with that film or camera. Readers vote notes helpful; you cannot vote on
your own.

## Slugs

Films and cameras live at `/films/{slug}` and `/cameras/{slug}`. A slug is the
brand plus the name, unless the name already starts with the brand.

Renaming writes a new slug and records the old one in `SlugHistory` in the same
transaction. The proxy answers the old slug, or a legacy id, with a 308 to the
current one. A retired slug is never handed out again; reusing one caused a 500
when a renamed camera was later re-added under its old name.

Pairing pages, `/films/{film}/shot-with/{camera}`, exist only for combinations
with at least three photos, and answer 404 below that.

## SEO

- **What is indexed:** film, camera and pairing pages, profiles and public
  albums. Not photo pages (1,100 pages shared 63 titles), gear pages with no
  photos, search, settings, admin or auth pages.
- **Sitemaps** are hand-built XML (`src/lib/seo/xml.ts`) because the built-in
  helper cannot produce an index or image entries. `lastmod` comes from real
  photo timestamps, not build time, which teaches search engines to ignore it.
- **robots.txt** blocks `/api`, `/admin`, `/settings`, `/upload` and edit pages,
  without a trailing slash so the bare paths are covered. Sign-in and search are
  left crawlable so crawlers can read their `noindex`.
- **Structured data** types gear as `Thing`, not `Product`, because Product
  requires offers or ratings and invented ratings risk a manual action.
- **Link previews** are 1200×630 JPEGs, since the PNG was 1.3MB and scrapers give
  up around five seconds. The site card is a collage of community photos with
  live counts.
