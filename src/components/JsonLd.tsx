/**
 * Renders schema.org JSON-LD into the document.
 *
 * `<` is escaped so a caption containing "</script>" can't break out of the tag.
 * This is a server component — the payload ships in the initial HTML, which is
 * the whole point (a crawler that doesn't run JS still sees it).
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
