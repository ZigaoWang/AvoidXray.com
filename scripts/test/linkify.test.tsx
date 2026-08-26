/**
 * The link parser turns text nobody vetted into anchors, so its edge cases are
 * security edges as well as cosmetic ones.
 *
 *   npx tsx scripts/test/linkify.test.tsx
 */
import { linkify } from '../../src/lib/linkify'

let pass = 0
let fail = 0

/** The href each produced anchor points at, in order. */
function hrefs(nodes: React.ReactNode[]): string[] {
  return nodes
    .filter((n): n is React.ReactElement<{ href?: string }> =>
      typeof n === 'object' && n !== null && 'props' in n)
    .map(n => String(n.props.href ?? ''))
}

/** The plain-text fragments, so trailing punctuation can be checked. */
function texts(nodes: React.ReactNode[]): string[] {
  return nodes.filter((n): n is string => typeof n === 'string')
}

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('linkify')

// A bracket the URL opened must survive; one that wraps it must not.
check('keeps a balanced closing paren',
  hrefs(linkify('see https://en.wikipedia.org/wiki/Film_(disambiguation) here')),
  ['https://en.wikipedia.org/wiki/Film_(disambiguation)'])
check('drops a wrapping paren',
  hrefs(linkify('(see https://example.com/a)')),
  ['https://example.com/a'])
check('wrapping paren stays as text',
  texts(linkify('(see https://example.com/a)')).join(''),
  '(see )')
check('drops a sentence full stop',
  hrefs(linkify('read https://example.com/a.')),
  ['https://example.com/a'])

// The reason this file exists.
check('protocol-relative path is not treated as internal',
  hrefs(linkify('https://avoidxray.com//evil.com')),
  ['https://avoidxray.com//evil.com'])
check('genuine internal link becomes a path',
  hrefs(linkify('https://avoidxray.com/photos/abc')),
  ['/photos/abc'])
check('www of our own host is internal too',
  hrefs(linkify('https://www.avoidxray.com/films/portra-400')),
  ['/films/portra-400'])

// Only http(s); anything else stays prose.
check('javascript: is not linked', hrefs(linkify('javascript:alert(1)')), [])
check('bare domain is not linked', hrefs(linkify('visit example.com today')), [])
check('mailto is not linked', hrefs(linkify('mail me at a@b.com')), [])

check('empty input', linkify(''), [])
// Records can hold anything; this renders inside a server component.
check('non-string input', linkify(null as unknown as string), [])

check('several links in one note',
  hrefs(linkify('a https://one.com/x, b https://two.com/y.')),
  ['https://one.com/x', 'https://two.com/y'])

console.log(`\n  ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
