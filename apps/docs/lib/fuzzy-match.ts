/**
 * Simple fuzzy matching utility for search.
 * Handles common typos and partial matches.
 */

/**
 * Calculate Levenshtein distance between two strings.
 * Used for typo tolerance.
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate fuzzy match score between query and text.
 * Returns a score from 0 (no match) to 1 (exact match).
 *
 * @param query - The search query
 * @param text - The text to match against
 * @param maxDistance - Maximum allowed Levenshtein distance (default: 2)
 * @returns Score from 0 to 1
 */
export function fuzzyMatch(
  query: string,
  text: string,
  maxDistance: number = 2
): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()

  // Empty query matches nothing
  if (!q) return 0

  // Exact match
  if (t.includes(q)) return 1

  // Word boundary match (higher priority)
  const words = t.split(/\s+/)
  for (const word of words) {
    if (word.startsWith(q)) return 0.9
  }

  // Fuzzy match on words
  for (const word of words) {
    const distance = levenshtein(q, word)
    if (distance <= maxDistance) {
      return Math.max(0.5, 1 - distance / Math.max(q.length, word.length))
    }
  }

  // Partial fuzzy match on beginning of words
  for (const word of words) {
    if (word.length >= q.length) {
      const prefix = word.substring(0, q.length)
      const distance = levenshtein(q, prefix)
      if (distance <= 1) {
        return 0.6
      }
    }
  }

  return 0
}

/**
 * Highlight matching portions of text.
 *
 * @param text - The text to highlight
 * @param query - The search query
 * @returns Array of segments with match information
 */
export function highlightMatches(
  text: string,
  query: string
): { text: string; isMatch: boolean }[] {
  if (!query.trim()) {
    return [{ text, isMatch: false }]
  }

  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  const result: { text: string; isMatch: boolean }[] = []

  let lastIndex = 0
  let index = t.indexOf(q)

  while (index !== -1) {
    // Add non-matching segment
    if (index > lastIndex) {
      result.push({
        text: text.substring(lastIndex, index),
        isMatch: false,
      })
    }

    // Add matching segment
    result.push({
      text: text.substring(index, index + q.length),
      isMatch: true,
    })

    lastIndex = index + q.length
    index = t.indexOf(q, lastIndex)
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push({
      text: text.substring(lastIndex),
      isMatch: false,
    })
  }

  return result.length > 0 ? result : [{ text, isMatch: false }]
}

/**
 * Filter and rank items by fuzzy match score.
 *
 * @param items - Items to filter
 * @param query - Search query
 * @param getText - Function to extract searchable text from item
 * @param threshold - Minimum score to include (default: 0.3)
 * @returns Filtered and sorted items with scores
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  threshold: number = 0.3
): { item: T; score: number }[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 1 }))

  return items
    .map((item) => ({
      item,
      score: fuzzyMatch(query, getText(item)),
    }))
    .filter((result) => result.score >= threshold)
    .sort((a, b) => b.score - a.score)
}
