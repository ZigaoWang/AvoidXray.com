# Library

The private library: rolls, labs, private originals and, later, the library
views themselves. How files are stored and served is in [images.md](images.md);
the switch of existing originals to private is in
[operations.md](operations.md#making-originals-private).

## Import

`/library/import`, behind the `library` flag. Files go from the browser
straight to the bucket; the site never relays them.

1. **Drop.** Folders, zips and single files, or the file picker. Zips are
   read in a Web Worker (`fflate`), so each scan uploads on its own. JPEG,
   PNG, TIFF and HEIC are accepted; anything else is listed as refused, with
   the reason.
2. **Rolls.** Each folder that holds images is proposed as a roll, named
   after it, and files dropped outside any folder as one more roll with no
   title. Every roll is shown with the standard header: shot date, film,
   camera, lab. Frames are ordered by a natural sort of their names. The rolls are created at once (`Roll` rows, empty of details), so
   files can be moved between them, rolls merged, split or renamed, and files
   taken out of any roll (loose photos), before, during or after the upload.
   A folder dropped again rejoins the roll it made the first time.
3. **Hash, then register.** Each file is hashed in a Web Worker: the whole
   file (sha256) and its image data (`imageDataSha256`). Registering an
   import item checks the owner's library for either hash; a match is skipped
   and listed with the photo it matches. The same file still uploading from
   an earlier visit is resumed, not started again.
4. **Upload.** S3 multipart, signed per part (`src/lib/library/multipart.ts`):
   the server creates the upload and signs part URLs on request, an hour
   each; the browser PUTs the parts and the server completes the upload after
   checking the parts add up to the declared size, then sets the object
   private (the bucket ignores the ACL an upload is started with). The bucket
   allows PUT from `https://avoidxray.com` for this. Three
   files at a time, two parts each. Failed parts retry with backoff, and an
   upload left by a closed tab resumes from the parts already stored
   (ListParts). A bucket lifecycle rule aborts multipart uploads left
   incomplete for two days; the hourly cleanup expires their items.
5. **Process.** `scripts/import-worker.ts`, its own pm2 process at low
   priority, claims uploaded items one at a time (`FOR UPDATE SKIP LOCKED`),
   checks the stored bytes against the declared sha256, and runs the same
   pipeline as `/api/upload` (`processImage` with the original already
   stored). The photo is created private, with screening pending, so the
   vision worker screens and tags it as it does every upload. A photo that
   looks like one already in the library is flagged for the owner to keep or
   remove, never dropped: its perceptual hash finds the candidate, and the
   flag shows only once the SigLIP embeddings agree (`lookalike.ts`).
6. **Details.** Per roll, on screen during the upload: film, camera, lab,
   shot dates (month or day), developed date, location, EI, notes, scanner.
   The scanner model is read from the files' metadata and prefilled; the shot
   date never is. Film, camera and lab are suggested from the owner's last
   roll. Saved as they are entered; a photo in a roll takes its details from
   the roll.
7. **Publish.** The last step asks: keep private, publish all, or choose.
   The last answer is preselected. Until it is answered everything stays
   private, and an answer given while photos are still processing applies to
   them as they finish.
8. **Storage.** Usage and the limit are shown before and during an import,
   and an item that would go over it is refused with a message saying so.
   The default is 20 GB, admins have no limit, and `User.storageLimitBytes`
   overrides the default for one account.

In development with `LOCAL_UPLOADS=1`, the multipart calls are served by a
local route that writes to `public/local-uploads`, so the whole flow runs
without the bucket.

## The library

`/library`, behind the `library` flag.

- **Home.** The owner's rolls newest first as contact sheets: when the roll
  was shot where the owner said, otherwise when its first photo was uploaded
  (a backfilled roll was created long after its photos). Each header reads
  "Oct 12, 2026 · Portra 400 · Nikon FM2 · Irohas" with the photo count and
  how many are published. Loose photos follow in their own section. Rolls load
  a page at a time as the list scrolls (`src/lib/library/browse.ts`); a roll's
  section is skipped by the browser while off screen.
- **Filters and search.** Film stock, camera, lab, year shot and published or
  private combine, and live in the URL. The year comes from the roll's shot
  dates or the photo's own date; a photo with neither is under "Undated". Search
  matches words (caption, file name, the roll's title, location and notes, the
  film, camera and lab names) or content, through the vision worker scoring
  only the owner's photos (`POST /search` with their ids). When the worker is
  not answering, the page says the search is by words only. On a phone the
  filters fold behind a Filters button.
- **Selection.** Click the check, or any photo once something is selected;
  shift-click for a range; drag a box on desktop; long press on a phone;
  "Select all" on a roll; Escape to clear.
- **Bulk actions.** Publish and make private (through `/api/photos/bulk`,
  which moves files as any visibility change does), add to album, edit
  details, move to a roll or a new roll, split into a new roll that keeps the
  source roll's details, make loose, delete. Film, camera and lab are written
  only on loose photos: a photo in a roll takes them from the roll, and the
  dialog says how many were left for that reason. On a phone, publish, make
  private and delete stay in the bar and the rest sit under More.
- **Catalog.** Every film, camera and lab picker in the library offers to add
  what is missing, with the upload page's forms and the same review
  (`src/app/library/import/AddCatalogItem.tsx`).
- **Roll actions.** Edit details (every photo follows), merge into another
  roll (frames appended), reorder frames, delete.
- **Viewer.** The stored large version, public or signed for the owner; the
  details panel saves as it is edited; previous and next walk the roll, or the
  loose photos. Arrow keys move, P publishes or unpublishes, Escape closes.
- **Albums.** Add from a selection with the existing album dialog; reorder on
  the album's edit page (`PUT /api/albums/[id]/order`).

### Trash

- Deleting from the library sets `deletedAt` (`src/lib/library/trash.ts`).
  The photo leaves every listing at once, and its files move to private keys,
  as when a photo is made private: a deleted photo's files stop loading from
  addresses pages and caches knew. It keeps its roll and album places.
- Restoring puts it back, public again if it was published. Deleting a roll
  trashes its photos and keeps the roll, out of sight, so they return to it.
- After 30 days the hourly cleanup purges it: the row, every stored file, and
  the copies in the server's media mirror (`MEDIA_ROOT`), since the mirror
  never deletes on its own and the policy promises every copy goes. Emptying
  the Trash, or deleting from it, purges at once. A roll left with nothing in
  it goes with its last photo.
- The privacy policy gains its sentence about the Trash on the day this
  ships, never before.
- Deleting from a photo's own page uses the Trash too for an owner with the
  library. Without it, and for an admin removing someone else's photo, it
  still deletes outright.

## The public side

Built from published photos only (`PUBLIC_PHOTO`), for everyone alike,
the owner included: the library is where their whole roll is.

- **Roll pages**, `/rolls/[id]`: the roll's name and its line (shot dates,
  film, camera, lab), the owner, and its published frames in the roll's order
  (`ROLL_ORDER` in `src/lib/photoFeed.ts`, paged by `/api/photos?rollId=`).
  A roll with nothing published is a 404, answered by `src/proxy.ts`. The
  location, notes, scanner and EI stay private (`src/lib/publicRoll.ts`).
- **Profiles** gain a Rolls tab and a rolls count, from rolls with anything
  published.
- **Photo pages** show the roll the photo came from, while the roll has a page,
  and the lab in the details.
- **Labs**, `/labs` and `/labs/[slug]`, list labs as `/cameras` lists cameras,
  with the film and cameras their rolls were shot on and the photos they
  developed (`/api/photos?labId=`). A photo's lab follows its roll's, as its
  film and camera do. "Suggest edit" opens the camera and film dialog with the
  lab's fields (the `labs` allowlist in `src/lib/admin/resources.ts`) and sends
  them to `POST /api/labs/[id]`, which queues a revision or applies an admin's.
  The footer links Labs only once the catalog has one (`labsExist`).
- **Collections**, `/collections` and `/collections/[slug]`: the archive
  sources, read-only on `ArchiveSource`, `ArchiveRecord` and their photos
  (`src/lib/collections.ts`, `PUBLIC_ARCHIVE_PHOTO`). Paged by
  `/api/photos?collection=`, which serves archive photos only and never mixes
  them into a community feed.
- The hub sitemap lists labs and rolls with published photos, and the
  Collections pages. The footer links Collections, and Labs once there is one.
- Public counts say "N photos"; "published" is the library's word, beside
  the private ones.
