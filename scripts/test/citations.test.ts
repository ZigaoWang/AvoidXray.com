/**
 * Guards how a citation is presented.
 *
 * Fujifilm 400 is contract manufactured by Kodak, and the source recording that
 * is the Wikipedia article on Superia, because the sentence lives there: the
 * film replaced Superia X-tra 400. The entry was reported as wrong on the
 * strength of the URL alone, and it is not wrong — but nothing on the page let
 * anyone tell, because the passage behind the link was never shown.
 *
 * These cases are the ones that decide whether a reader can judge a citation
 * without opening it.
 *
 *   npx tsx scripts/test/citations.test.ts
 */
import { citationsByField, citationTitle } from '../../src/lib/citations'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const WIKI = 'https://en.wikipedia.org/wiki/Fujifilm_Superia'

console.log('resolving a field to its citation')
check('the passage travels with the url',
  citationsByField([{ fieldName: 'manufacturerStatus', sourceUrl: WIKI,
    claims: [{ claim: 'Kodak', passage: 'replaced by Fujifilm 400, contract manufactured by Kodak', url: WIKI }] }]).get('manufacturerStatus'),
  { url: WIKI, passage: 'replaced by Fujifilm 400, contract manufactured by Kodak' })

check('our own wording is never quoted as the source',
  citationsByField([{ fieldName: 'description', sourceUrl: WIKI,
    claims: [{ claim: 'It starts as a motion picture negative', url: WIKI }] }]).get('description'),
  { url: WIKI, passage: null })

check('a url with no recorded passage still yields a link',
  citationsByField([{ fieldName: 'manufacturerStatus', sourceUrl: WIKI, claims: null }]).get('manufacturerStatus'),
  { url: WIKI, passage: null })

check('a field with no source is absent entirely',
  citationsByField([{ fieldName: 'iso', sourceUrl: null, claims: null }]).get('iso'),
  undefined)

console.log('choosing among several claims')
check('the claim matching this url wins',
  citationsByField([{ fieldName: 'description', sourceUrl: 'https://b.example',
    claims: [{ passage: 'from a', url: 'https://a.example' }, { passage: 'from b', url: 'https://b.example' }] }]).get('description')?.passage,
  'from b')

check('house voice never supplies the passage',
  citationsByField([{ fieldName: 'description', sourceUrl: WIKI,
    claims: [{ passage: 'our own judgment', editorial: true }] }]).get('description')?.passage,
  null)

check('falls back to any sourced claim when none matches the url',
  citationsByField([{ fieldName: 'description', sourceUrl: 'https://b.example',
    claims: [{ passage: 'from a', url: 'https://a.example' }] }]).get('description')?.passage,
  'from a')

console.log('what the reader is told')
check('the passage is quoted',
  citationTitle({ url: WIKI, passage: 'contract manufactured by Kodak' }),
  '“contract manufactured by Kodak” — opens the source')

check('a missing passage says so rather than implying a check',
  citationTitle({ url: WIKI, passage: null }),
  'Opens the source. No supporting passage was recorded for this claim.')

check('no citation, nothing to say', citationTitle(undefined), '')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
