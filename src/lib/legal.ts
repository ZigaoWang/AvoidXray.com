import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { marked } from 'marked'

/**
 * The terms and privacy policy.
 *
 * The guidelines are not here: they live on /guidelines, in the site's voice,
 * and these terms reference them.
 *
 * legal.md at the repo root is the single source, rendered rather than copied,
 * so the wording people agree to and the wording in version control cannot
 * drift apart — the failure mode that matters most for a text whose whole
 * purpose is to be the agreed wording.
 */

/**
 * Which wording someone agreed to, recorded against their account.
 *
 * Taken from the document's own "Last updated" line so it cannot be updated
 * independently of the text. When that date changes, this changes, and it is
 * then possible to tell who agreed to what.
 */
export async function legalVersion(): Promise<string> {
  const source = await legalMarkdown()
  const match = source.match(/^\*\*Last updated:\s*(.+?)\*\*/m)
  return match ? match[1].trim() : 'unversioned'
}

let cached: string | null = null

export async function legalMarkdown(): Promise<string> {
  if (!cached) {
    cached = await readFile(join(process.cwd(), 'legal.md'), 'utf8')
  }
  return cached
}

/**
 * GitHub's heading slug rules, which is the format the document's own
 * cross-references are written in: lower case, punctuation dropped, spaces to
 * hyphens.
 */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * The document as HTML.
 *
 * Headings are given ids, because marked stopped emitting them and the
 * document links to its own sections. Without this the table of contents at
 * the top and every "see Part Two" reference are dead links, which is a poor
 * showing for a page whose parts constantly refer to each other. Duplicate
 * headings get a numeric suffix so two sections can never claim one anchor.
 *
 * The output is inserted without sanitising, which is safe here and only here:
 * the input is a file in this repository, not anything a visitor can write.
 * Nothing else on the site should render markdown this way.
 */
export async function legalHtml(): Promise<string> {
  const seen = new Map<string, number>()
  const renderer = new marked.Renderer()

  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    const base = slug(text)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    return `<h${depth} id="${id}">${text}</h${depth}>\n`
  }

  return marked.parse(await legalMarkdown(), { async: false, gfm: true, renderer })
}
