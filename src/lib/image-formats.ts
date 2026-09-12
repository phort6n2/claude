/**
 * What a logo upload accepts, in ONE place.
 *
 * WHY THIS IS SHARED RATHER THAN TYPED TWICE. The file picker's `accept` list
 * and what the server can actually decode are two different lists that have
 * to agree, and when they drift the failure is silent in the worse direction:
 * a format the server handles perfectly is greyed out in the picker, so the
 * shop owner concludes the app cannot take their logo and nothing anywhere
 * says otherwise. AVIF sat in exactly that gap — sharp has decoded it all
 * along, the picker simply never offered it.
 *
 * No sharp import here on purpose: this is imported by a client component,
 * and pulling the image library into the browser bundle to read a list of
 * strings would be a poor trade on pages where hydration weight has been
 * fought over twice. `scripts/check-image-formats.ts` is what proves the two
 * halves still agree, by decoding a real file of every format named below.
 */

export interface UploadFormat {
  /** As a person would say it. */
  label: string
  mime: string
  /**
   * EVERY extension this format goes by, not just the usual one.
   *
   * `.jpeg` is why this is a list. The picker matches the file name it is
   * given, so offering only `.jpg` greys out a file somebody's design tool
   * named `.jpeg` — the same dead end this whole module exists to close,
   * reintroduced one character at a time. The first entry is the canonical
   * one, used when a sample file has to be named.
   */
  ext: string[]
}

/**
 * Every format the logo slots take.
 *
 * SVG is deliberately absent. sharp reads it only when its build carries
 * librsvg, which Vercel's does not guarantee, and an SVG that fails there
 * fails as a broken image in a live site header rather than as an error
 * anybody sees.
 */
export const LOGO_FORMATS: UploadFormat[] = [
  { label: 'PNG', mime: 'image/png', ext: ['.png'] },
  { label: 'JPEG', mime: 'image/jpeg', ext: ['.jpg', '.jpeg'] },
  { label: 'WebP', mime: 'image/webp', ext: ['.webp'] },
  { label: 'AVIF', mime: 'image/avif', ext: ['.avif'] },
]

/**
 * THERE IS NO `accept` FILTER ON THE UPLOAD INPUTS, AND THAT IS THE FIX.
 *
 * This started as `image/png,image/jpeg,image/webp`, which hid AVIF the app
 * could read. It was then widened to every MIME type, then to every spelling
 * of every extension, then to `image/*` as well — belt, braces and a second
 * belt. An operator on a MacBook Air still could not see `.webp` files in the
 * dialog, on a page whose input demanded `image/webp` and `.webp` by name
 * (verified in the rendered DOM, on the deployed commit).
 *
 * The lesson is about where the filtering happens. `accept` is not a rule the
 * browser applies to the file name — it is a hint the OPERATING SYSTEM
 * resolves against its own type registry, and when that registry has never
 * heard of a format the file simply is not offered. We cannot see that
 * registry, cannot test against every version of it, and cannot tell the
 * difference from here between "the dialog hid it" and "the app refused it".
 * Two rounds of adding tokens is the evidence: each one fixed the format that
 * had been reported and left the next one to be reported later.
 *
 * So the dialog filters nothing and the DECODER decides, which is the only
 * place that can actually answer the question — it either reads the bytes or
 * it does not, on every machine, for every format, without consulting
 * anything. A wrong file gets a sentence saying what went wrong and what
 * works instead. A file that never appears in the list gets nothing.
 *
 * The formats are still named on screen and in every refusal, so the list
 * below is what the app TELLS people; it is no longer what the dialog is
 * trusted to enforce. Do not reintroduce `accept` here without a way to test
 * it on the machines that actually failed.
 */

/** "PNG, JPEG, WebP or AVIF" — for error copy that has to name them. */
export const LOGO_FORMATS_SENTENCE = (() => {
  const names = LOGO_FORMATS.map((f) => f.label)
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
})()
