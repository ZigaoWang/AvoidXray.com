# Library

The private library: rolls, labs, private originals and, later, the library
views themselves. How files are stored and served is in [images.md](images.md);
the switch of existing originals to private is in
[operations.md](operations.md#making-originals-private).

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
