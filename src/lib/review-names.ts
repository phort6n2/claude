/**
 * The name customers keep saying.
 *
 * A small shop's real advantage over a national chain is that the same
 * person does the work every time, and the reviews say so by name. That
 * signal is already sitting in the review text — this just surfaces it,
 * rather than asking a shop owner to fill in another onboarding field.
 *
 * Deliberately conservative: it only reports a name mentioned in at least
 * two reviews AND in a majority of them, so one chatty reviewer can't put a
 * random word on the page. Nothing is asserted that the reviews don't say.
 */

/** Capitalised words that are not people. Kept tight on purpose. */
const NOT_A_NAME = new Set([
  'i', 'we', 'they', 'he', 'she', 'it', 'my', 'the', 'a', 'an', 'and', 'but', 'so', 'then',
  'this', 'that', 'these', 'those', 'there', 'here', 'when', 'what', 'who', 'why', 'how',
  'if', 'as', 'at', 'on', 'in', 'to', 'for', 'from', 'with', 'by', 'of', 'or',
  'google', 'yelp', 'facebook', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'auto', 'glass', 'windshield', 'windshields', 'adas', 'suv', 'vin', 'oem',
  'honda', 'toyota', 'ford', 'chevy', 'chevrolet', 'nissan', 'subaru', 'jeep', 'tesla',
  'bmw', 'audi', 'lexus', 'kia', 'hyundai', 'mazda', 'dodge', 'gmc', 'volvo', 'acura',
  'thanks', 'thank', 'great', 'excellent', 'awesome', 'highly', 'very', 'super',
])

export function mostMentionedName(
  quotes: Array<{ text: string; author?: string }>
): string | null {
  if (quotes.length < 2) return null

  const counts = new Map<string, number>()
  for (const q of quotes) {
    const text = q.text || ''
    // The reviewer's own name appears in the byline, not the story — don't
    // let it count as the technician everyone mentions.
    const authorFirst = (q.author || '').trim().split(/\s+/)[0]?.toLowerCase() || ''

    // Capitalised words that are not sentence-initial: a name in prose.
    const seenInThisReview = new Set<string>()
    const words = text.split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const raw = words[i]
      const word = raw.replace(/[^\p{L}']/gu, '')
      if (word.length < 3 || word.length > 14) continue
      if (!/^\p{Lu}\p{Ll}+$/u.test(word)) continue
      const lower = word.toLowerCase()
      if (NOT_A_NAME.has(lower) || lower === authorFirst) continue
      // Skip a word that opens a sentence — capitalisation there says nothing.
      const prev = i > 0 ? words[i - 1] : ''
      if (i === 0 || /[.!?]$/.test(prev)) continue
      seenInThisReview.add(word)
    }
    for (const name of seenInThisReview) {
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }

  let best: { name: string; n: number } | null = null
  for (const [name, n] of counts) {
    if (!best || n > best.n) best = { name, n }
  }
  if (!best) return null
  // Two mentions minimum, and a majority of the reviews shown — otherwise it
  // is a coincidence, not the person who does the work.
  return best.n >= 2 && best.n * 2 > quotes.length ? best.name : null
}
