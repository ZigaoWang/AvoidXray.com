/**
 * Guards the word filter in both directions.
 *
 * Too loose and a slur becomes someone's username, or an insult a comment. Too strict and a person
 * from Scunthorpe cannot write where they live, or a caption about shiitake
 * is refused. Every innocent word here is one a pattern in the library once
 * caught, or a near miss of one.
 *
 *   npx tsx scripts/test/wordFilter.test.ts
 */
import { hasBlockedWords, type WordFilterUse } from '../../src/lib/wordFilter'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const uses: WordFilterUse[] = ['username', 'displayName', 'text', 'search']
const refusedIn = (text: string) => uses.filter(use => hasBlockedWords(text, use))

console.log('innocent words pass everywhere')
for (const word of [
  'Scunthorpe', 'title', 'scatter', 'cumulative', 'assassin', 'Sussex', 'therapist', 'cocktail', 'analysis',
  'pussycat', 'sextant', 'classic', 'peacock', 'Matsushita', 'shiitake', 'Dickens', 'grape', 'skyscraper',
  'Hitchcock', 'arsenal', 'Shitara', 'documentary', 'about', 'negroni', 'Penistone', 'fagus', 'Kodak Ektar 100',
  'swimsuit', 'bikini', '夜晚的街道', '淫雨', '裸眼', '猫', '妈妈的相机', '生日你快乐',
  // Real names from several languages, and words, that patterns once caught.
  'Bích Ngọc', 'Dikshit', 'Cummings', 'Analise', 'Wankel', 'cockpit', 'retardant', 'mishit',
]) check(word, refusedIn(word), [])

console.log('where each kind of word is refused')
check('a slur, disguised', refusedIn('f4ggot'), uses)
check('a sexual word', refusedIn('porn'), uses)
check('a Chinese sexual word', refusedIn('裸体'), uses)
check('swearing is refused everywhere', refusedIn('this shit is great'), uses)
check('an insult aimed at someone', refusedIn('fuck u'), uses)
check('a Chinese insult', refusedIn('傻逼'), uses)
check('a nudity request is refused in search only', refusedIn('nude'), ['search'])
check('a name that is also a word passes as a display name only', refusedIn('Dick Smith'), ['username', 'text', 'search'])
check('a Chinese nudity request is refused in search only', refusedIn('全裸'), ['search'])
check('empty text is fine', refusedIn(''), [])

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
