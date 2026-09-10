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
 * The `accept` attribute: `image/*`, then the types, then the extensions.
 *
 * ALL THREE, and the belt-and-braces is the point. A file dialog resolves
 * these against the operating system's own idea of what a type is, and every
 * form of that lookup fails somewhere:
 *
 * - `image/avif` is unknown to an older macOS or Windows, which maps it to
 *   nothing and greys the file out — indistinguishable, to the person
 *   standing there, from the app refusing AVIF.
 * - `.avif` covers that, until a file arrives named something else.
 * - `image/*` covers whatever the system DOES class as an image, which is the
 *   only one of the three that keeps up on its own.
 *
 * Listing `image/*` also means the dialog offers formats the server will
 * refuse — SVG, most obviously. That is deliberate and it is the better
 * trade: a refusal names the problem and says what to do instead ("export an
 * SVG to PNG first"), while a greyed-out file explains nothing and cannot be
 * argued with. The decoder is the authority on what is accepted, not the
 * dialog; this list only decides what a person is allowed to try.
 */
export const LOGO_ACCEPT = [
  'image/*',
  ...LOGO_FORMATS.map((f) => f.mime),
  ...LOGO_FORMATS.flatMap((f) => f.ext),
].join(',')

/** "PNG, JPEG, WebP or AVIF" — for error copy that has to name them. */
export const LOGO_FORMATS_SENTENCE = (() => {
  const names = LOGO_FORMATS.map((f) => f.label)
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
})()
