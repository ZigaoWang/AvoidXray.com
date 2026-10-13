/**
 * A page that has only something to say: not found, could not load, failed.
 *
 * Six of these were written separately and no two matched: titles at two
 * sizes and two weights, buttons at two sizes, a text link where the others
 * had buttons, and vertical padding on some but not others. This renders the
 * page's main region; the caller supplies the header and footer around it,
 * since server and client pages use different headers.
 */
export default function PageMessage({
  kicker,
  title,
  children,
  actions,
}: {
  /** Something set above the title, such as the 404 numeral. */
  kicker?: React.ReactNode
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        {kicker}
        <h1 className="mb-3 text-2xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
        <div className="mb-8 text-neutral-500">{children}</div>
        {actions && <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>
    </main>
  )
}
