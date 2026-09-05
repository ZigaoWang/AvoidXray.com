import RevisionQueue from './RevisionQueue'

export default function Page() {
  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-white">Proposed changes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Contributor suggestions and anything generated wait here. Your own
          edits apply as you make them and are recorded rather than queued.
          Accept each field or refuse it with a reason.
        </p>
      </header>
      <RevisionQueue />
    </div>
  )
}
