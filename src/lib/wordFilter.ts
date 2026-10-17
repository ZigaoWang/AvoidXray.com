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
 * "Scunthorpe". Slurs, sexual words and swearing are all refused, in names
 * and in everything else people write.
 *
 * Chinese has no word boundaries for a matcher to use, so the short Chinese
 * lists below are matched as substrings.
 */

const CHINESE_SLURS = ['支那', '黑鬼', '尼哥']
/**
 * Insults and swearing, the Chinese counterpart of the library's swearing.
 * Whole phrases where a shorter form hides in ordinary words: 妈的 is inside
 * 妈妈的 ("mom's"), and 日你 inside 生日你 ("birthday, you").
 */
const CHINESE_INSULTS = [
  '傻逼', '傻b', '煞笔', '傻屌', '操你', '草你妈', '肏', '日你妈', '你妈的', '他妈的', '去你妈',
  '草泥马', '狗日', '去死', '贱人', '婊子', '王八蛋', '混蛋', '脑残', '智障', '弱智',
]
const CHINESE_SEXUAL = ['色情', '黄片', '黄图', '裸照', '裸体', '做爱', '性交', '淫秽', '淫荡', '卖淫', '屌', '鸡巴', '阴茎', '阴道', '口交', '援交', '约炮']

/**
 * Words that ask for nudity without being sexual words themselves. Refused in
 * search, so the box does not answer the question at all; the screening check
 * already keeps such photos off the site.
 */
const SEARCH_ONLY = ['nude', 'nudes', 'naked', 'nudity', 'nsfw', 'topless', 'lingerie', 'erotic', 'xxx']
const CHINESE_SEARCH_ONLY = ['裸露', '全裸', '半裸', '露点', '情色', '走光', '内衣']

/**
 * Innocent words and real names the library's patterns catch, found by running
 * it over likely text and a list of names from several languages. Some of its
 * patterns match inside a word, so "fag" finds the beech genus, "bitch" the
 * Vietnamese name Bích, and "shit" the Indian surname Dikshit.
 */
const ALLOWED = [
  'pussycat', 'pussy willow', 'penistone', 'fagus', 'faggio', 'shiitake', 'shitake', 'shitara',
  'bich', 'bích', 'dikshit', 'cummings', 'analise', 'wankel', 'cockpit', 'retardant', 'mishit',
]

/**
 * Words that are also common names, or parts of them: Dick for Richard, and
 * the others as they turn up inside names. Not refused in a display name,
 * which is usually a person's real name. Still refused in a username, which
 * is chosen, and in what people write.
 */
const NAME_WORDS = new Set(['dick', 'cock', 'tit', 'cum', 'anal', 'wank', 'bitch'])

function matcher(keep: (word: string) => boolean) {
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

const everyWord = matcher(() => true)
const exceptNames = matcher(word => !NAME_WORDS.has(word))

const SEARCH_ONLY_PATTERN = new RegExp(`\\b(${SEARCH_ONLY.join('|')})\\b`, 'i')

function containsAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term))
}

/**
 * Where the text is going.
 *
 * - `username`: chosen handles.
 * - `displayName`: usually a real name, so words that are also names pass.
 * - `text`: comments, bios, captions, notes, album names.
 * - `search`: a search query, which also refuses words asking for nudity.
 *
 * Swearing is refused in text as well as names. Comments were allowed to
 * swear, and the first test of that was an insult aimed at a photographer.
 */
export type WordFilterUse = 'username' | 'displayName' | 'text' | 'search'

export function hasBlockedWords(text: string, use: WordFilterUse): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  if (containsAny(lower, CHINESE_SLURS) || containsAny(lower, CHINESE_SEXUAL) || containsAny(lower, CHINESE_INSULTS)) return true
  if ((use === 'displayName' ? exceptNames : everyWord).hasMatch(text)) return true
  return use === 'search' && (SEARCH_ONLY_PATTERN.test(lower) || containsAny(lower, CHINESE_SEARCH_ONLY))
}

/** The message shown when a field is refused. Names the field rather than the word. */
export function blockedWordsMessage(field: string): string {
  return `${field} contains words that aren't allowed here.`
}
