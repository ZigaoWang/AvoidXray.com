import { PageSkeleton, AlbumFormSkeleton } from '@/components/ui/Skeleton'

/**
 * The album form, which the page itself draws too.
 *
 * Editing an album is a client component that fetches on mount, and it shows
 * AlbumFormSkeleton for as long as that takes — but nothing covered the step
 * before it, so the route fell back to /albums/loading.tsx and you saw the
 * index's tab row and six album cards on the way to a form. Using the same
 * skeleton on both sides means the handover is invisible: the placeholder
 * stands still while the page takes it over.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <AlbumFormSkeleton />
    </PageSkeleton>
  )
}
