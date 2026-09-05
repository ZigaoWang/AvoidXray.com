import RevisionQueue from './RevisionQueue'

export default function Page() {
  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-white">Proposed changes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every edit arrives here: contributors, your own admin edits, and anything
          generated. Accept what is right, refuse the rest with a reason.
        </p>
      </header>
      <RevisionQueue />
    </div>
  )
}
