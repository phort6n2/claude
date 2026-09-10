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
 * The `accept` attribute, MIME types AND extensions.
 *
 * Both, because the two are not interchangeable in a file dialog: a system
 * that does not know a type maps nothing to it and quietly greys the file
 * out, which is the same dead end as not listing it. AVIF is new enough for
 * that to be a live concern, and the extension costs nothing where the MIME
 * type is already understood.
 */
export const LOGO_ACCEPT = [
  ...LOGO_FORMATS.map((f) => f.mime),
  ...LOGO_FORMATS.flatMap((f) => f.ext),
].join(',')

/** "PNG, JPEG, WebP or AVIF" — for error copy that has to name them. */
export const LOGO_FORMATS_SENTENCE = (() => {
  const names = LOGO_FORMATS.map((f) => f.label)
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
})()
