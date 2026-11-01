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
  only the owner's photos (`POST /search` with their ids). Photos only the
  worker found come last, in their own section, "Photos that look like" the
  query (`section=lookalike`), since the model ranks the closest-looking
  photos there are and a place never shot still finds some. Site search does
  the same (`lookalikeStart` in `src/lib/photoSearch.ts`). When the worker is
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

## Export

The styled export (frames, borders, watermark) is called Frame & watermark
everywhere; the untouched files are Download originals.

Download originals, from a roll's menu, an album's menu, More in the
selection bar, or Download whole library on the Downloads tab
(`/library/downloads`; `/library/exports` redirects there). The files exactly as uploaded, one folder per roll
("2026-10-12 Harbour", loose photos in "Loose photos"), with photos.csv and
photos.json beside them: each photo's file, part, roll and frame, caption,
dates, film, camera, lab, the roll's location and notes, sha256, and its page
when published (`src/lib/library/exports.ts`). Files keep the name they were
uploaded under when it was recorded; otherwise a roll's photos are named for
their frame ("07.jpg") and loose photos for the day they were shot, or
uploaded, and a short id ("2026-10-12 a1b2c3.jpg"). Dropping a file that is
already in the library records its name on the photo if it had none, so older
photos gain their names over time. Only the owner's photos: an
album's photos by other people are left out and the toast says how many.

- **Small exports** (up to 60 photos and 400MB, the styled export's bounds)
  are zipped in the browser from signed addresses, with a progress dialog.
- **Larger ones** are queued (`LibraryExport`) and built by the export worker
  (`scripts/export-worker.ts`, pm2 `avoidxray-exports`): parts of at most 4 GB,
  inside the zip format's 32-bit limits, stored privately under `exports/`.
  The bell says when it is ready (`export_ready`, or `export_failed` after
  three attempts). Downloads go through
  `/api/library/exports/[id]/parts/[n]`, which checks the owner and the
  expiry and redirects to a short-lived signed address. After 7 days the
  worker deletes the zips and the export shows as expired.
- **Exactly as uploaded:** every original is checked against the sha256
  recorded at upload; one that does not match fails the build. An original
  missing from storage is listed in the metadata as missing and counted on
  the Downloads page.
- **Limits:** one export at a time per account, and one whole-library export
  a week except for admins. A failed export does not count.
- **Load:** the worker runs at the lowest CPU priority, reads originals from
  the server's media mirror when it has them (checked by sha256, falling back
  to the bucket), and paces bucket reads and zip uploads to
  `EXPORT_READ_MBPS` and `EXPORT_WRITE_MBPS` (8 each by default, about half of
  what one connection from the server reaches). It holds one
  original on disk and one 16MB upload piece in memory.

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

## Opening day (plan for review, nothing here is done yet)

The library is on for admin accounts only (`hasFeature` in
`src/lib/features.ts`). Opening it is two deploys a week or more apart, so
the first can be undone in seconds and nothing is deleted until the first has
held.

1. **Open.** `hasFeature(viewer, 'library')` returns true for every signed-in
   account. The session claim (`token.library` in `src/lib/auth.ts`) is
   recomputed on each request, so accounts switch over on their next page
   load without signing in again. The redirects stay temporary (307). The
   classic code stays in place, unreachable, as the way back. The privacy
   policy changes below ship in this same deploy.
2. **Settle**, after at least seven days with no rollback: delete the
   classic code, make the redirects permanent (308), and drop the flag.

### What changes for accounts that did not have the library

- **Signed-in home.** The logo and `/` go to `/library`. The header gains
  Library, and phones get the bottom tab bar (Library, Explore, Upload,
  Activity, You).
- **Uploading.** `/upload` is the library uploader: folders and zips become
  rolls, originals are kept private, uploads resume, duplicates are skipped,
  and everything starts private until published. Links with `?film=` and
  `?camera=` keep working. A photo the nudity check flags is held for review
  automatically instead of being refused with "Ask for a review".
- **Managing photos.** Your photos (`/manage`) becomes the library's All
  photos view. The photo edit page (`/photos/[id]/edit`) opens the photo in
  the library viewer, which edits the same fields plus lab and roll.
- **Deleting.** Every delete an owner makes goes to the Trash and can be
  restored for 30 days, including bulk deletes, which today delete outright.
  An admin removing someone else's photo still deletes it outright.
- **New:** library search, rolls, Download originals for a roll, an album, a
  selection or the whole library (one whole-library export a week), and the
  Downloads tab.
- **Storage limit.** 20 GB per account starts to apply (see below).
- **Unchanged:** every public page, profile, album and photo URL, and what
  visitors who are signed out see.

### Redirects

| From | To | Today | Day 1 | Settle |
|---|---|---|---|---|
| `/manage` | `/library?view=all` | 307, library accounts | 307, everyone | 308, in `next.config.ts` |
| `/photos/[id]/edit` | `/library?photo=[id]`, for the owner | 307, library accounts | 307, everyone | 308 for the owner; others get a 404, as now |
| `/` when signed in | `/library` | 307, library accounts | 307, everyone | stays 307: signed-out visitors keep the landing page |
| `/library/import` | `/upload` | 307, everyone | unchanged | 308 |
| `/library/exports` | `/library/downloads` | 308 | unchanged | unchanged |

Permanent redirects are cached by browsers, and `/library` answers 404 to an
account without the feature. A 308 during a rollback would strand people on
a 404, so the 308s come only with the second deploy.

### Code deleted at Settle

- **Classic upload:** `src/app/upload/ClassicUpload.tsx`, the classic branch
  of `src/app/upload/page.tsx`, `src/app/api/upload/route.ts`, and
  `src/components/MissingMetadataModal.tsx` (only the classic upload uses it).
- **Abandoned-draft cleanup, partly:** the hourly cron calls
  `/api/upload/cleanup`, which does three things: deletes classic drafts
  (`uploadComplete: false`), expires abandoned library uploads
  (`expireAbandonedUploads`) and purges the Trash after 30 days
  (`purgeExpiredTrash`). Only the first goes, once a run shows no drafts
  left; the route, the cron and the admin CleanupButton stay for the other
  two. A clearer home for them (a library cleanup route) can come later.
- **Your photos:** `src/app/manage/` (page, ManagePhotos, loading). The
  redirect moves to `next.config.ts`. `PhotoBrowser` stays, because the
  album picker uses it.
- **Photo edit page:** `src/app/photos/[id]/edit/` (layout and page). The
  photo page's edit link always points at the library viewer.
- **The flag:** every `hasFeature(…, 'library')` branch keeps its library
  side: the bulk and single photo delete routes, the photo page, the album
  pages, `/albums`, `/upload`, the header, the home redirect, the session
  claim, and `requireLibraryUser` and `requireLibraryPage`, which go back to
  requiring only a signed-in account. `src/lib/features.ts` goes if nothing
  else is flagged by then.
- **Tests:** the classic upload and Your photos checks, after their library
  equivalents are confirmed to cover the same cases.

### Privacy policy (`legal.md`), on Day 1

The sentence about the Trash, under "How long we keep it", replacing the
start of "Deleted content":

> **Deleted photos:** go to your Trash, where only you can see them, and can
> be restored for 30 days. After that, or as soon as you empty the Trash,
> the photo and every copy of it are deleted. Database backups are kept for
> up to 30 days more, so a deleted photo can stay in a backup for that long
> before it is gone for good.

Lines that stop being true on the same day, with replacements:

- Terms, section 5: "This is a place to show your work, not a backup."
  becomes "We keep your originals carefully, but we can't promise they will
  never be lost. Keep your own copies too."
- How long we keep it: "Uploads you never published: deleted automatically
  after an hour." becomes "**Photos you keep private:** kept until you delete
  them. **Download links for exports:** work for 7 days, then the zip is
  deleted."
- What's public, the nudity check: "A photo the check flags is not stored at
  all, unless you ask for a review" becomes "A photo the check flags is
  stored privately and held for review: only you and the administrator can
  see it until the administrator decides."
- Where your data is: image files are also kept on the server in Los
  Angeles, as a copy of what is in Hong Kong. Add "and a copy of the image
  files" to the first bullet.
- "Last updated" moves to the opening date.

### Announcement draft

For review, not sent. A site notice or a line on the home page, never an
email.

> **Your library is open**
>
> AvoidXray now keeps your whole film archive, not just the photos you post.
> Upload a roll, a folder or a zip from your lab: each becomes a roll with
> its film, camera, lab and dates, and everything stays private until you
> choose to publish it. Your originals are kept exactly as you uploaded
> them, and only you can download them.
>
> Search your library for what is in the photos, find a roll by its film or
> its lab, and download originals for a roll, an album or everything, with
> a file listing each photo's details. Deleted photos wait in your Trash for
> 30 days. Each account has 20 GB.
>
> Your published photos, profile and albums are where they were. Open
> Library from the menu to start.

### Storage limit

- 20 GB per account (`DEFAULT_STORAGE_LIMIT_BYTES` in
  `src/lib/library/storage.ts`, counted as 20 × 1024³ bytes, so it shows as
  "20.0 GB"). Admin accounts have none.
- It counts every original and its display copies, photos in the Trash until
  they are purged, and uploads in progress at their declared size.
- **Shown** (`src/components/StorageUsage.tsx`) on the uploader, under the
  library's title and in Settings: one quiet line ("4.2 GB of 20.0 GB
  used") until 80% of the limit, then in the warning color with a bar, what
  is left, and "At the limit, new uploads pause. Nothing you have stored is
  deleted or hidden." At the limit it becomes a notice: photos are safe,
  nothing is deleted or hidden, published photos stay up, only new uploads
  wait; to make room, delete photos and empty the Trash, which counts until
  emptied, downloading originals first to keep a copy.
- **Checked before an upload starts.** A drop larger than the room left is
  refused whole, with the same notice and the sizes ("These files come to
  3.1 GB and you have 1.2 GB left, so the upload has not started"), so an
  import never stops halfway. Files still being read in the page count
  against the room. Files already in the library count too, because their
  duplicates are found only once read: re-dropping a folder near the limit
  can be refused although most of it would be skipped. The server's own
  check stays as the backstop for anything that slips past.
- **Admin control:** "Storage limit (GB)" in the admin users table, blank for
  the default, one account at a time. Every change writes a
  `StorageLimitChange` (admin, account, old and new limit, time) in the same
  transaction, listed at `/admin/storage-limits`.

### Rollback

- **Rollback steps, in order:** (1) `TRASH_PURGE_PAUSED=1` in `.env`;
  (2) `deploy avx rollback`; (3) check the classic upload, Your photos and
  the photo edit page as a non-admin account; (4) post a site notice if the
  library was visibly gone for people; (5) when the fix is deployed, remove
  `TRASH_PURGE_PAUSED` and reload.
- **Within the first deploy (Day 1 to Settle):** `deploy avx rollback`
  switches back to the previous release in seconds. There is no schema
  migration in the opening deploy, so nothing has to be undone in the
  database. Everyone is back on the classic pages, with the redirects
  gone because they were temporary.
- **What people keep across a rollback.** Photos uploaded through the
  library are ordinary photos in the same table: they show in Your photos,
  private unless published. Rolls stay in the database, unseen. Photos in
  the Trash stay hidden and cannot be restored without the library, so the
  30-day purge should pause during a rollback, or someone's 30 days can run
  out while they cannot reach them. Set `TRASH_PURGE_PAUSED=1` in `.env`
  and reload the site (`pm2 reload avoidxray --update-env`); the hourly
  cleanup then reports `"purgedTrash": "paused"` and still does its other
  work. Remove the line and reload once the library is back. Exports
  already built keep their zips until they expire; the Downloads page is
  unreachable meanwhile.
- **A narrower way back:** if one piece is at fault, such as the uploader,
  ship a fix or point that route back to its classic branch (still present
  until Settle) rather than closing the whole library.
- **After Settle** the classic code is gone. Going back means a revert
  commit and a deploy, and browsers that cached a 308 still send
  `/manage` to `/library`. That is why Settle waits for a quiet week.
- **Watch for the first day:** the usual post-deploy checks and 15-minute
  watch, then the error log, the import worker's queue and failures, new
  rows in the Trash, refused uploads for the storage limit, and the export
  worker, checked at 1 hour, 6 hours and 24 hours.

### Before Day 1: what to test yourself

Use a non-admin test account given the library for the test, or your own
account where noted.

- [ ] Upload a roll as a folder, a zip from a lab, and single files from a
      phone. Rolls form as expected; film, camera, lab and dates save; an
      upload interrupted halfway resumes.
- [ ] Drop the same files again: they are skipped as already in the library.
- [ ] Publish some photos and keep the rest private. Signed out, only the
      published ones appear on the profile, the roll page, search, the film
      and camera pages, and the sitemap.
- [ ] Open a private photo's original and display addresses signed out and
      from another account: both refuse.
- [ ] Edit film or camera on a photo in a roll: "Change for the whole roll"
      and "Just this photo" both do what they say.
- [ ] Delete a photo, a selection and a roll; restore them from the Trash;
      empty the Trash.
- [ ] Search your library for a place, an object, a film and a lab; check
      the "Photos that look like" section is labeled.
- [ ] Download originals for a small roll (in the browser) and for the whole
      library (built on the server); open both zips and photos.csv.
- [ ] Albums: create one, add from a selection, reorder, and download its
      originals.
- [ ] On a phone: the tab bar, uploading, selecting, the selection bar and
      the Trash.
- [ ] Go near the limit (set `storageLimitBytes` low on the test account):
      the meter turns red and an upload past it is refused clearly.
- [ ] As an admin, upload for another account (`/upload?asUserId=`) and see
      it in /admin/uploads-for-accounts.
- [ ] Read the privacy policy changes and the announcement above.

## Later

- **Place search from place data.** Image recognition cannot tell a place
  from one that looks like it: searching a city nobody has shot returns
  photos of other cities, labeled as look-alikes. Places should come from
  data instead: the roll's location, and GPS read from the originals. GPS
  is for the owner's own library search only and never reaches a public
  page, a public search or a derivative; roll locations stay out of public
  search as they are now.
