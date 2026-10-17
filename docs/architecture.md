# Architecture

How a request becomes a page, how the data is shaped, and how browsing works.
The other documents go deeper on [images](images.md), the [catalog](catalog.md),
[vision](vision.md), [security](security.md) and [operations](operations.md).

## Shape of the system

One Next.js 16 process (App Router, React 19) in front of PostgreSQL 14, with
images in Aliyun OSS. There is no separate API service: route handlers under
`src/app/api` serve the client components, and server components query Prisma
directly. A second process, the vision worker, screens uploads and answers
content search; see [vision](vision.md).

```
browser ── nginx ── Next.js (pm2, one fork) ──┬── PostgreSQL 14
                                              ├── Aliyun OSS (originals, renditions)
                                              ├── Vision worker (pm2, loopback)
                                              ├── Umami (loopback, analytics)
                                              └── Mailtrap (email)
```

Everything that bounds work (the render semaphore, the source image cache, the
rate limiter) lives in process memory. That is why the app runs as exactly one
fork; see [operations](operations.md#process).

## A request

1. **`src/proxy.ts`** runs first, on Node. It answers what has to be decided
   before rendering starts: a real 404 for a username, photo or album that does
   not exist or that this viewer may not see, 308s for renamed film and camera
   slugs and for repeated query keys, and 404 for pairing pages with too few
   photos. Pages with a `loading.tsx` stream a 200 shell immediately, so a
   `notFound()` inside them is too late to change the status; the proxy is the
   only place a status can still be set.
2. **The page** renders on the server. Pages that need the viewer read the
   session once; queries that do not depend on each other run in parallel waves.
3. **Client components** take over for anything interactive: the grid's
   infinite scroll, likes, comments, dialogs, the upload flow.

`src/lib/topLevelRoutes.ts` lists every first path segment the app owns. Any
other segment is read as a username, so a new top-level route must be added
there; `scripts/test/topLevelRoutes.test.ts` compares the list with the route
tree. Registration refuses usernames on the list.

## Data model

23 models in `prisma/schema.prisma`:

| Area | Models |
|---|---|
| People and photos | User, Photo, PhotoEmbedding, Like, Comment, Follow, Notification, Collection (albums), CollectionPhoto |
| Catalog | FilmStock, FilmVariant, Camera, Brand |
| Editorial history | Revision, FieldProvenance, SlugHistory |
| Community and safety | CommunityNote, NoteVote, ModerationSubmission, Report, Block |
| Site feedback | Feedback, FeedbackMessage |

A few decisions shape everything else:

- **`published` and `visibility` are different things.** `published` means the
  upload finished; drafts older than an hour are deleted. `visibility` is the
  owner's choice of public or private. Only the second is a privacy control.
- **`screening` is the third gate.** A new upload is public only once the
  nudity check clears it. Kept apart from `visibility` so lifting a hold
  restores the owner's own choice.
- **Polymorphic references have no foreign key.** Reports, community notes,
  provenance rows and slug history point at several tables by kind and id, and
  their consumers handle a target that has gone.
- **Catalog records carry a `version`.** Edits are checked against the version
  they were drafted from, so a stale proposal cannot overwrite newer work.
- **Rules Prisma cannot express are in SQL.** CHECK constraints, triggers and
  expression indexes live in migrations and are listed in
  [db-objects.md](db-objects.md). CI proves they still exist and still refuse
  bad rows.

## Feeds

Explore, profiles, film and camera pages, albums and search all page photos
through the same pieces in `src/lib/photoFeed.ts`.

**One definition of each feed.** The first screen is rendered by the page and
every screen after it by `/api/photos`. They once had separate copies of the
ordering, which drifted: Popular came back in date order on the first screen and
in like order after it, and the grid's dedupe silently dropped photos that
appeared in both. Now both call `feedWhere` and `feedOrderBy`.

**Scopes.** A `FeedScope` narrows a feed by film, camera, photographer, album,
UTC day or recent period (week, month, year). The random tab orders by a seeded
hash, which Prisma cannot express, so it uses raw SQL from `feedScopeSql`. That
function is a `Record` over every scope key, so adding a key without handling it
in both places is a type error. It exists because the raw copy once ignored two
keys and showed a filtered count above an unfiltered grid.

**Seeded order.** Random feeds sort by `md5(id || seed)`. The server picks a
seed, renders the first page with it and hands it to the grid, which sends it
with every later page. A reader who goes back from a photo returns to the same
order, and the server HTML agrees with what the client renders.

**Stable ties.** Every ordering ends in `createdAt` then `id`. Without that,
hundreds of photos with zero likes sorted differently on each query and offset
paging skipped and repeated rows.

**Counts without `_count`.** Prisma compiles `_count` in a `findMany` into a
`GROUP BY` over the whole child table, which also costs the parent query its
index. Measured at 100k photos and 500k likes: 444ms with it, 0.074ms without,
for the same 31 rows. `src/lib/counts.ts` queries the page first, then counts
only the ids that came back.

**Prev and next follow the grid.** `src/lib/photoNeighbors.ts` walks the same
order the grid was in (seeded, by likes, by date, or by the album's own
sequence), so stepping through photos matches scrolling through them. Albums and
narrowed lists also show a position, "12 of 36".

## The grid

`src/components/MasonryGrid.tsx` renders every photo wall.

- The server renders two columns and the client repacks to three or four, so a
  phone never receives a four-column layout it then reflows.
- Infinite scroll fetches 30 at a time and starts 1000px before the end, since a
  page takes about 0.7s to arrive. Each page is deduped by id, and a response
  for a feed the reader has since left is dropped.
- When a photo is opened, the grid saves its photos, offset, seed and scroll
  position to sessionStorage. It restores them only on a Back navigation and
  only for the same feed, so a fresh visit always starts fresh.
- A failed page shows Try again instead of retrying forever.

## Discovery

- **Home** shows a hero of 100 photos drawn from the latest 400, with gear tiles
  mixed in. Signed in, it adds a row from people you follow (`recentMix`): a
  pool ten times the row, shuffled per visit, with no photographer allowed more
  than their share.
- **More like this** on a photo page ranks by what the photos look like, then
  fills from shared film and camera, with at most two per photographer.
- **Profiles** keep their tab, sort and filter in the URL. The activity heatmap
  is counted per UTC day in SQL and clicking a day filters the grid with the
  same day boundaries.
- **Search** is one page, `/search`, opened from the header on every screen
  size. It finds photos by what they show and by whole words in captions
  (`src/lib/photoSearch.ts`), sorts by best match, newest or most liked, and
  filters by the film stocks and cameras in the results, each with the count
  it would leave. Profiles, albums, and film and camera pages have a box that
  searches only their photos. People lists page by cursor.

## Photo page

`src/app/photos/[id]/page.tsx` loads the photo once per request (Prisma calls
are not deduped between metadata and body) and the rest in parallel. Comments
and community notes are server-rendered. The lightbox fetches the original only
when the screen is wider than the 1600px rendition, prefetches the neighbors,
and supports swipe and arrow keys. Admins see a link to the photo's admin row.

No photo page is indexed: 1,100 pages shared 63 titles, and the film, camera and
pairing pages are what should rank. See [catalog](catalog.md#seo).

## UI system

`src/components/ui` holds 24 shared components. Most exist because there used
to be several versions of the same thing: 13 hand-drawn avatars, 8 link styles,
8 label styles, 4 page heading sizes, error messages in 3 shades of red. Rules
that follow from them:

- **Focus** is a 1px brand outline with a 2px offset everywhere. Brand red clears
  3:1 against every surface; the tints it replaced were 1.19:1.
- **Dialogs** share `useDialogBehavior`: an open-panel stack so only the top
  dialog handles keys, a Tab trap, scroll lock and focus return.
  `useBackdropDismiss` closes only when the press also started on the backdrop,
  so selecting text and releasing outside does not close the dialog.
- **Contrast.** `neutral-500` is overridden to `#858585`, because Tailwind's
  default is 4.2:1 against the page and fails AA.
- **Loading.** 16 `loading.tsx` skeletons match the layouts they precede.
- **Toasts** stay mounted in two live regions, errors as `alert` and the rest as
  `status`, so screen readers hear them.
- **Inputs** are 16px on phones so iOS does not zoom.

Design tokens are in `src/app/globals.css`; the palette and type are in
[BRANDING.md](../BRANDING.md).
