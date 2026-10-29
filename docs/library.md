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

## Phase 3 notes

Requirements already decided for when the library views ship.

### Trash

- Deleting a photo sets `deletedAt` instead of removing the row. The photo
  leaves every public surface at once (`PUBLIC_PHOTO` and `visibleToViewer`
  already exclude it), and the owner can restore it for 30 days.
- After 30 days it is purged: the row, and every stored file, the original
  included. The purge must also delete the photo's files from the VPS media
  mirror (`MEDIA_ROOT`), since the mirror never deletes on its own. The policy
  will promise that every copy is permanently deleted, and the mirror is a
  copy.
- The privacy policy gains its sentence about Trash on the day Trash ships,
  never before.
