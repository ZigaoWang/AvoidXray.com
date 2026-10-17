import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

/**
 * Words the site refuses, and where.
 *
 * English matching is the `obscenity` library: a maintained word list with the
 * usual evasions undone (leetspeak, repeated letters, look-alike characters)
 * and exceptions for innocent words that contain a bad one, such as
 * "Scunthorpe". Its words are sorted here into three groups, because a word
 * that is fine in a comment is not fine as a username.
 *
 * Chinese has no word boundaries for a matcher to use, so the short Chinese
 * lists below are matched as substrings.
 */

/** Slurs against a group of people. Refused everywhere. */
const SLURS = new Set([
  'abo', 'abeed', 'africoon', 'arabush', 'boonga', 'chingchong', 'chink', 'dyke', 'fag',
  'kike', 'negro', 'nigger', 'retard', 'spastic', 'tranny',
])

/** Sexual words. Refused everywhere: the guidelines allow nothing sexual. */
const SEXUAL = new Set([
  'anal', 'anus', 'bestiality', 'blowjob', 'boob', 'buttplug', 'cock', 'cum', 'cunt', 'deepthroat',
  'dick', 'dildo', 'doggystyle', 'double penetration', 'ejaculate', 'felch', 'fellatio', 'finger bang',
  'fisting', 'gangbang', 'handjob', 'hentai', 'hooker', 'incest', 'jerk off', 'jizz', 'lubejob',
  'masturbate', 'orgasm', 'orgy', 'penis', 'porn', 'pussy', 'rape', 'scat', 'semen', 'sex', 'slut',
  'tit', 'twat', 'vagina', 'wank', 'whore',
])

// Everything else in the library is ordinary swearing ("shit", "fuck"). Allowed
// in comments and bios, where people talk; refused in names and search.

const CHINESE_SLURS = ['支那', '黑鬼', '尼哥']
const CHINESE_SEXUAL = ['色情', '黄片', '黄图', '裸照', '裸体', '做爱', '性交', '淫秽', '淫荡', '卖淫', '屌', '鸡巴', '阴茎', '阴道', '口交', '援交', '约炮']

/**
 * Words that ask for nudity without being sexual words themselves. Refused in
 * search, so the box does not answer the question at all; the screening check
 * already keeps such photos off the site.
 */
const SEARCH_ONLY = ['nude', 'nudes', 'naked', 'nudity', 'nsfw', 'topless', 'lingerie', 'erotic', 'xxx']
const CHINESE_SEARCH_ONLY = ['裸露', '全裸', '半裸', '露点', '情色', '走光', '内衣']

/**
 * Innocent words the library's patterns catch, found by running it over
 * likely text. Some of its patterns match the start of a word, so "fag" also
 * finds the beech genus.
 */
const ALLOWED = ['pussycat', 'pussy willow', 'penistone', 'fagus', 'faggio', 'shiitake', 'shitake', 'shitara']

function matcherFor(keep: (word: string) => boolean) {
  const dataset = new DataSet<{ originalWord: string }>()
    .addAll(englishDataset)
    .removePhrasesIf(phrase => !keep(phrase.metadata?.originalWord ?? ''))
    .build()
  return new RegExpMatcher({
    ...dataset,
    whitelistedTerms: [...(dataset.whitelistedTerms ?? []), ...ALLOWED],
    ...englishRecommendedTransformers,
  })
}

const everyWord = matcherFor(() => true)
const harmfulWords = matcherFor(word => SLURS.has(word) || SEXUAL.has(word))

const SEARCH_ONLY_PATTERN = new RegExp(`\\b(${SEARCH_ONLY.join('|')})\\b`, 'i')

function containsAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term))
}

/**
 * Where the text is going.
 *
 * - `name`: usernames and display names. Shown on every photo, comment and
 *   notification, so no swearing either.
 * - `text`: comments, bios, captions, notes, album names. Swearing is allowed;
 *   slurs and sexual words are not.
 * - `search`: a search query. Refused like a name, plus words asking for nudity.
 */
export type WordFilterUse = 'name' | 'text' | 'search'

export function hasBlockedWords(text: string, use: WordFilterUse): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  if (containsAny(lower, CHINESE_SLURS) || containsAny(lower, CHINESE_SEXUAL)) return true
  if (use === 'text') return harmfulWords.hasMatch(text)
  if (everyWord.hasMatch(text)) return true
  return use === 'search' && (SEARCH_ONLY_PATTERN.test(lower) || containsAny(lower, CHINESE_SEARCH_ONLY))
}

/** The message shown when a field is refused. Names the field rather than the word. */
export function blockedWordsMessage(field: string): string {
  return `${field} contains words that aren't allowed here.`
}
