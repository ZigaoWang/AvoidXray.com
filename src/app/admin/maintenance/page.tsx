import CleanupButton from '../CleanupButton'
import OrphanCleanupButton from '../OrphanCleanupButton'
import OSSSyncButton from '../OSSSyncButton'

/**
 * The destructive operational tools, gathered in one place rather than sitting
 * beside the content tables where they can be hit by accident.
 */
export default function MaintenancePage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">Maintenance</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Storage and housekeeping. These actions are irreversible. Read what each one says before running it.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="border border-neutral-800 p-4">
          <h2 className="text-sm font-medium text-white mb-1">Object storage</h2>
          <p className="text-xs text-neutral-500 mb-3">
            Finds files in the bucket that no record points at. Photos, avatars, camera and film images and
            pending moderation uploads are all accounted for; anything outside those prefixes is reported but
            never deleted.
          </p>
          <OSSSyncButton />
        </section>

        <section className="border border-neutral-800 p-4">
          <h2 className="text-sm font-medium text-white mb-1">Unpublished drafts</h2>
          <p className="text-xs text-neutral-500 mb-3">
            Removes photos that were uploaded but never published. A cron does this hourly; this runs it now.
          </p>
          <CleanupButton />
        </section>

        <section className="border border-neutral-800 p-4 sm:col-span-2">
          <h2 className="text-sm font-medium text-white mb-1">Orphaned records</h2>
          <p className="text-xs text-neutral-500 mb-3">
            Clears notifications and moderation submissions belonging to deleted accounts, and cameras and film
            stocks with no photos left. Note that this also removes catalogue entries nobody has shot yet.
          </p>
          <OrphanCleanupButton />
        </section>
      </div>
    </div>
  )
}
