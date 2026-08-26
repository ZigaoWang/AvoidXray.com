/**
 * String normalization and fuzzy matching utilities
 * Used for duplicate detection in cameras and film stocks
 */

/**
 * Normalize a string for comparison by:
 * - Converting to lowercase
 * - Removing special characters except spaces
 * - Trimming whitespace
 * - Collapsing multiple spaces
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars except spaces
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of edits needed to transform one string into another
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length

  // Create a 2D array for dynamic programming
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0))

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i
  for (let j = 0; j <= len2; j++) matrix[0][j] = j

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[len1][len2]
}

/**
 * Calculate similarity score between two strings (0-1 range)
 * 1 = identical, 0 = completely different
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1)
  const normalized2 = normalizeString(str2)

  if (normalized1 === normalized2) return 1
  if (normalized1.length === 0 || normalized2.length === 0) return 0

  const distance = levenshteinDistance(normalized1, normalized2)
  const maxLength = Math.max(normalized1.length, normalized2.length)

  return 1 - (distance / maxLength)
}

/**
 * The tokens of a name that carry a digit — "400", "500T", "HP5", "K1000".
 *
 * In camera and film naming these are the model designator, and they are what
 * separates one product from the next.
 */
function designators(normalized: string): string[] {
  return normalized.split(' ').filter(word => /\d/.test(word)).sort()
}

/**
 * How alike two product names are, 0-1.
 *
 * Edit distance alone rates "Kodak Gold 200" against "Kodak Gold 800" at 93%
 * and "Kodak Vision3 500T" against "Kodak Vision3 250D" at 83%, because the
 * digits that distinguish them are two characters inside a long, otherwise
 * identical string. Each of those is a real film someone can legitimately add,
 * and telling them it already exists either turns them away or has them tag
 * their photographs with the wrong stock.
 *
 * So names whose designators disagree are treated as different products
 * regardless of the rest. The cost is missing a duplicate whose designator was
 * mistyped, and that is the safer way to be wrong: an unflagged duplicate is
 * left for review, a wrongly flagged one loses a real product.
 */
export function productSimilarity(name1: string, name2: string): number {
  const a = normalizeString(name1)
  const b = normalizeString(name2)
  if (a === b) return 1

  const [left, right] = [designators(a), designators(b)]
  if (left.length > 0 && right.length > 0 && left.join(' ') !== right.join(' ')) return 0

  return calculateSimilarity(a, b)
}

/**
 * Find potential duplicates from a list
 */
export function findPotentialDuplicates<T extends { name: string; brand: string | null }>(
  input: { name: string; brand: string | null },
  items: T[],
  limit: number = 5,
  threshold: number = 0.7
): (T & { similarity: number })[] {
  return items
    .map(item => ({
      ...item,
      similarity: productSimilarity(
        input.brand ? `${input.brand} ${input.name}` : input.name,
        item.brand ? `${item.brand} ${item.name}` : item.name
      )
    }))
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}
