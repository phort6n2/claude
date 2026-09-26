/**
 * READ A SHOP'S COLOURS OFF THEIR OWN WEBSITE — from what the site USES, not
 * from what its stylesheets happen to declare.
 *
 * The obvious reading is wrong, and it was checked against a real shop before
 * any of this was written. EliteProGlass's page declares `--tpg-primary-color:
 * #0d6efd` (The Post Grid plugin: Bootstrap blue), `--latepoint-brand-primary:
 * #1d7bff` (their booking plugin's default) and `--ast-global-color-0:
 * #0089e4` (the theme's stock palette). Three variables literally named
 * "primary", all blue, all somebody else's defaults. The site itself is black,
 * with red (#d40000) buttons, menu and headings — a colour that appears in no
 * variable at all, only in the theme's customizer output. A reader that
 * believed the names would have painted a black-and-red shop in Bootstrap
 * blue, and nothing would ever have gone red.
 *
 * So colours are scored by USE: a background on a button is the strongest
 * statement a site makes about its call to action, a colour on the menu or a
 * heading is its brand, and a declaration nobody reads is worth little.
 * Plugin and core stylesheets are skipped by their ids, and the palettes that
 * ship inside every WordPress site, Bootstrap, and the social networks' own
 * brand colours are refused outright — Instagram's purple is on half the
 * footers in the book.
 *
 * THE LOGO IS THE TIEBREAK, because a logo is the brand by definition. A
 * colour the page uses AND the logo is drawn in is the shop's; a colour only
 * the page uses might be a plugin's.
 *
 * Pure: strings and numbers in, a verdict out. `brand-scan.ts` does the
 * fetching, and `scripts/check-brand-colors.ts` holds EliteProGlass's real
 * declarations as the trap.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface BrandScheme {
  /** The colour the whole site derives from. May be a near-black. */
  primary: string
  /** The call-to-action colour, when the site has one distinct from primary. */
  accent: string | null
  /** A second brand colour, when there is one. Rarely matters. */
  secondary: string | null
  /** Plain-English lines saying where each colour came from. */
  evidence: string[]
}

export type BrandReading =
  | ({ ok: true } & BrandScheme)
  | { ok: false; reason: string; evidence: string[] }

// ---- colour maths -------------------------------------------------------

export function parseColor(raw: string): Rgb | null {
  const s = raw.trim().toLowerCase()
  let m = s.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    const h = m[1]
    if (h.length === 3 || h.length === 4) {
      const [r, g, b] = [h[0], h[1], h[2]].map((c) => parseInt(c + c, 16))
      if (h.length === 4 && parseInt(h[3] + h[3], 16) < 150) return null
      return { r, g, b }
    }
    if (h.length === 6 || h.length === 8) {
      if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 150) return null
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
    }
    return null
  }
  m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
      // A mostly transparent colour is a tint or a shadow, not a brand.
      if (!(a >= 0.6)) return null
    }
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.min(255, parseInt(v, 10)))
    return { r, g, b }
  }
  return null
}

export function toHex({ r, g, b }: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

export function hsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  h *= 60
  return { h, s, l }
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Colourful enough to be a brand, rather than a grey, a white or a black. */
export function isChromatic(c: Rgb): boolean {
  const { s, l } = hsl(c)
  return s >= 0.25 && l >= 0.12 && l <= 0.9
}

function isDarkNeutral(c: Rgb): boolean {
  return isDarkSurface(c)
}

// ---- what is never a shop's brand -----------------------------------------

/**
 * Colours that are somebody else's. WordPress core's preset palette ships in
 * every WordPress page's global styles; Bootstrap's and the WordPress admin's
 * blues come with plugins; the rest are the social networks and Google, whose
 * icons sit in shop footers. Each was either seen on a real shop page or is
 * the default of a plugin that was.
 */
const NOT_THE_SHOP = new Set(
  [
    // WordPress core presets
    '#cf2e2e', '#ff6900', '#fcb900', '#7bdcb5', '#00d084', '#8ed1fc', '#0693e3', '#9b51e0',
    '#abb8c3', '#f78da7', '#eee', '#313131',
    // WordPress admin / Gutenberg
    '#2271b1', '#135e96', '#72aee6', '#0073aa', '#007cba', '#006ba1', '#3858e9',
    // Bootstrap 3/4/5 and Bulma. Frameworks bundle EVERY button variant
    // (.btn-danger, .is-success …), so each arrives scored as a button.
    '#0d6efd', '#007bff', '#6c757d', '#28a745', '#198754', '#dc3545', '#ffc107', '#17a2b8',
    '#0dcaf0', '#6610f2', '#6f42c1', '#d63384', '#fd7e14', '#20c997', '#337ab7', '#5bc0de',
    '#5cb85c', '#f0ad4e', '#d9534f', '#3273dc', '#23d160', '#ffdd57', '#ff3860', '#209cee',
    '#00d1b2', '#485fc7', '#3e8ed0', '#48c78e', '#f14668',
    // Theme stock accents that their page builders override on the page:
    // X/Pro's red (Auto Glass Kings — stock .x-btn rules under yellow ones).
    '#ff2a13', '#ac1100',
    // Plugin defaults seen on shop sites: LatePoint, The Post Grid, and the
    // Call Now Button's green (Speedy's page, where it outscored their blue).
    '#1d7bff', '#0654c4', '#009900',
    // WordPress admin notices, bundled into combined stylesheets
    '#d63638', '#b32d2e', '#00a32a', '#dba617',
    // Social networks and Google
    '#3b5998', '#1877f2', '#4267b2', '#385898', '#e4405f', '#c13584', '#833ab4', '#8a3ab9',
    '#bc2a8d', '#fd1d1d', '#405de6', '#5851db', '#e1306c', '#f77737', '#fcaf45', '#1da1f2',
    '#1d9bf0', '#cd201f', '#0077b5', '#0a66c2', '#25d366', '#128c7e', '#bd081c',
    '#e60023', '#cb2027', '#4285f4', '#34a853', '#fbbc05', '#ea4335', '#db4437', '#d32323',
    '#af0606', '#fe2c55', '#25f4ee', '#557dbc', '#00b2ff', '#1e88e5',
  ].map((h) => toHex(parseColor(h)!))
)

/**
 * Inline style blocks that are a plugin's or WordPress core's, by the id
 * WordPress gives them. The theme's customizer output (`astra-theme-css`,
 * `elementor-post-*`, `wp-custom-css`) is exactly what should be read; the
 * search widget's, the booking widget's and core's preset palette are not.
 */
const NOISE_STYLE_ID =
  /^(wp-emoji|wp-img|global-styles|core-block-supports|classic-theme|wp-block|jetpack|presto|latepoint|woocommerce|wc-|contact-form|wpforms|gform|elementor-(frontend|icons|pro)|font-?awesome|dashicons|admin-bar|solace|rank-?math|yoast|litespeed|cookie|cmplz|moove|borlabs|tpg|the-post-grid|swiper|slick|mailchimp|mc4wp|hubspot|trustindex|ti-widget)/i

/** Elements a plugin injects, whose inline styles are the plugin's. */
const PLUGIN_ELEMENT_CLASS = /\bcnb-|call-now-button|whatsapp|\bwa-|chat|cookie|jetpack|trustindex|elfsight|\bti-/i

/** Selectors that mean "this is a call to action". */
const BUTTON_SELECTOR =
  /button|\bbtn|\bcta\b|-cta|cta-|submit|elementor-button|wp-block-button|ast-custom-button|sqs-block-button|header-button|\.book|quote/i
/**
 * Rules for what a visitor does not see on a shop's page: interaction states
 * and blog furniture. A theme styles all of them in its default colour —
 * Astra paints the tag cloud's hover, the calendar's "today", the comment
 * links and every focused input with its stock blue — and together they
 * outvoted the red EliteProGlass actually shows.
 */
const STATE_PSEUDO = /:(hover|focus|focus-visible|focus-within|active|checked|visited)|::selection|::-webkit|::-moz/i
const FURNITURE =
  /tagcloud|calendar|post-count|entry-meta|page-links|nav-links|post-navigation|comment|widget|pagination|breadcrumb|search-form|wp-block-(search|calendar|tag|archives|latest)|\.secondary|sidebar|woocommerce|cart|checkout/i

/** Selectors that carry the brand but are not an action. */
const BRAND_SELECTOR = /\bh[1-3]\b|heading|title|menu|nav|\ba\b|link|header|logo|accent|highlight/i

interface Hit {
  color: Rgb
  weight: number
  why: 'button' | 'brand' | 'use' | 'declared' | 'theme-color' | 'logo'
}

/** How much a colour reached only through var() counts against a literal one. */
export const VAR_DISCOUNT = 0.35

const COLOR_RE = /(?<![&\w-])#[0-9a-f]{3,8}\b|rgba?\([^)]{5,40}\)/gi

function colorsIn(value: string): Rgb[] {
  const out: Rgb[] = []
  for (const m of value.match(COLOR_RE) || []) {
    const c = parseColor(m)
    if (c) out.push(c)
  }
  return out
}

/**
 * Every custom property the CSS defines, name → value. Themes put the brand
 * in a palette variable and USE it through `var()` — Speedy's header button is
 * `background: var(--global-palette1)`, with `--global-palette1: #3182CE`
 * defined elsewhere — so a reader that skips `var()` finds only the
 * declaration, which is scored as a promise rather than a use.
 */
export function customProperties(css: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) out.set(m[1], m[2].trim())
  return out
}

export function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 5 || !value.includes('var(')) return value
  return resolveVars(
    value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fallback?: string) =>
      vars.get(name) ?? fallback ?? ''
    ),
    vars,
    depth + 1
  )
}

/** Score every colour in a stylesheet by what it is used for. */
export function hitsFromCss(css: string, weightScale = 1, vars: Map<string, string> = customProperties(css)): Hit[] {
  const hits: Hit[] = []
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const chunk of clean.split('}')) {
    const brace = chunk.lastIndexOf('{')
    if (brace < 0) continue
    const selector = chunk.slice(0, brace)
    const body = chunk.slice(brace + 1)
    const isButton = BUTTON_SELECTOR.test(selector)
    const isBrand = BRAND_SELECTOR.test(selector)
    const parts = selector.split(',').map((p) => p.trim()).filter(Boolean)
    // Seen only when every selector in the rule is a state or furniture.
    const unseen =
      parts.length > 0 && parts.every((p) => STATE_PSEUDO.test(p) || FURNITURE.test(p))
    // One vote per colour per RULE: a button rule setting background and
    // border to the same red is one decision, not two.
    const ruleBest = new Map<string, Hit>()
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':')
      if (colon < 0) continue
      const prop = decl.slice(0, colon).trim().toLowerCase()
      const raw = decl.slice(colon + 1)
      const value = prop.startsWith('--') ? raw : resolveVars(raw, vars)
      // A colour reached through var() counts, at a discount. A theme routes
      // every default through its palette — Astra paints buttons
      // var(--ast-global-color-0) on every site it runs — and the shop's own
      // choice is usually the literal colour typed into a more specific rule
      // that overrides it. EliteProGlass: nine var() button rules in stock
      // blue, and the red their page actually shows typed in by hand.
      const viaVar = value !== raw
      const colors = colorsIn(value)
      if (!colors.length) continue
      let weight = 1
      let why: Hit['why'] = 'use'
      if (prop.startsWith('--')) {
        // A palette entry is a promise, not a use — plugins declare dozens.
        weight = 0.25
        why = 'declared'
      } else if (isButton && /^(background|background-color|border-color)$/.test(prop)) {
        weight = 4
        why = 'button'
      } else if (isBrand && (prop === 'color' || prop.startsWith('background') || prop.startsWith('border'))) {
        weight = 1.5
        why = 'brand'
      } else if (/shadow|outline/.test(prop)) {
        weight = 0.25
      }
      if (viaVar) weight *= VAR_DISCOUNT
      if (unseen) weight *= 0.2
      for (const color of colors) {
        const key = `${color.r},${color.g},${color.b}`
        const prev = ruleBest.get(key)
        if (!prev || prev.weight < weight * weightScale) {
          ruleBest.set(key, { color, weight: weight * weightScale, why })
        }
      }
    }
    hits.push(...ruleBest.values())
  }
  return hits
}

/** The page's own CSS: its style blocks (minus plugin noise) and style="" attributes. */
export function pageCss(html: string): string {
  const parts: string[] = []
  const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/gi
  let m: RegExpExecArray | null
  while ((m = styleRe.exec(html))) {
    const id = m[1].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || ''
    if (id && NOISE_STYLE_ID.test(id)) continue
    parts.push(m[2])
  }
  // style="" attributes, each as its own rule, keyed by the tag and class
  // so a styled <a class="button"> still counts as a button.
  const attrRe = /<([a-z0-9]+)([^>]*?)\sstyle\s*=\s*"([^"]*)"/gi
  while ((m = attrRe.exec(html))) {
    const cls = m[2].match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || ''
    if (PLUGIN_ELEMENT_CLASS.test(cls)) continue
    parts.push(`${m[1]} ${cls}{${m[3].replace(/&quot;/g, '"')}}`)
  }
  return parts.join('\n')
}

export function themeColorOf(html: string): Rgb | null {
  const tag = html.match(/<meta[^>]+name\s*=\s*["']theme-color["'][^>]*>/i)?.[0]
  const content = tag?.match(/content\s*=\s*["']([^"']+)["']/i)?.[1]
  return content ? parseColor(content) : null
}

/**
 * The page's own background, when it is declared on `body` or `html`: a site
 * built on black says so here, and that is the base its colours live on.
 */
export function bodyBackgroundOf(css: string): Rgb | null {
  const re = /(?:^|[}\s,])(?:html|body)\s*[{,][^}]*?background(?:-color)?\s*:\s*([^;}]+)/gi
  let found: Rgb | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const c = colorsIn(m[1])[0]
    if (c) found = c
  }
  return found
}

const SURFACE_SELECTOR =
  /(^|[\s,>])(html|body)\b|header|masthead|hero|banner|section|e-con|elementor-top-section|site-|navbar|\bmain\b|page|wrapper|container/i

/**
 * The dark the page is actually built on: the most-used dark background on
 * its surfaces (sections, header, hero), footer excluded because nearly every
 * light site has a dark footer. Only CONSULTED once something else has said
 * the base is dark — it picks WHICH dark, so Auto Glass Kings' charcoal-navy
 * #1b1d29 is kept rather than flattened to a generic black.
 */
export function darkSurfaceOf(css: string, vars: Map<string, string>): Rgb | null {
  const tally = new Map<string, { color: Rgb; n: number }>()
  for (const chunk of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')) {
    const brace = chunk.lastIndexOf('{')
    if (brace < 0) continue
    const selector = chunk.slice(0, brace)
    if (!SURFACE_SELECTOR.test(selector) || /footer/i.test(selector) || STATE_PSEUDO.test(selector)) continue
    const m = chunk.slice(brace + 1).match(/background(?:-color)?\s*:\s*([^;]+)/i)
    if (!m) continue
    for (const c of colorsIn(resolveVars(m[1], vars))) {
      if (!isDarkSurface(c)) continue
      const key = toHex(c)
      const cur = tally.get(key) || { color: c, n: 0 }
      cur.n++
      tally.set(key, cur)
    }
  }
  const best = [...tally.values()].sort((a, b) => b.n - a.n)[0]
  return best && best.n >= 2 ? best.color : null
}

/** Dark enough to be a base, and close enough to grey that it is not a brand hue. */
function isDarkSurface(c: Rgb): boolean {
  const { l } = hsl(c)
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  return l <= 0.2 && chroma <= 40
}

// ---- the verdict -----------------------------------------------------------

interface Cluster {
  seed: Rgb
  score: number
  buttons: number
  inLogo: boolean
  whys: Set<Hit['why']>
}

/** A colour needs this much use before it is called anybody's brand. */
export const MIN_BRAND_SCORE = 4
/** An accent has to be this far round the wheel from the primary to be a different colour. */
export const MIN_ACCENT_HUE_GAP = 35

export interface LogoColors {
  /** Chromatic colours in the logo with their share of its visible pixels. */
  colors: Array<{ color: Rgb; share: number }>
  /** Which background the logo was drawn for (logo-surface.ts). */
  surface: 'light' | 'dark' | null
}

export function readBrandScheme(input: {
  html: string
  /** Extra same-site stylesheets (a page builder's generated CSS). */
  css?: string[]
  logo?: LogoColors | null
}): BrandReading {
  const evidence: string[] = []
  const inline = pageCss(input.html)
  // One variable table across everything: a palette defined in a linked
  // sheet is used by the page's inline CSS and the other way round.
  const vars = customProperties([...(input.css || []), inline].join('\n'))
  const hits = [
    ...hitsFromCss(inline, 1, vars),
    ...(input.css || []).flatMap((c) => hitsFromCss(c, 0.75, vars)),
  ]

  const clusters: Cluster[] = []
  for (const hit of hits.sort((a, b) => b.weight - a.weight)) {
    if (!isChromatic(hit.color)) continue
    if (NOT_THE_SHOP.has(toHex(hit.color))) continue
    let cluster = clusters.find((c) => distance(c.seed, hit.color) < 36)
    if (!cluster) {
      cluster = { seed: hit.color, score: 0, buttons: 0, inLogo: false, whys: new Set() }
      clusters.push(cluster)
    }
    cluster.score += hit.weight
    if (hit.why === 'button') cluster.buttons++
    cluster.whys.add(hit.why)
  }

  // The logo agrees → it is the shop's colour, not a plugin's.
  const logoColors = input.logo?.colors.filter((c) => c.share >= 0.05 && isChromatic(c.color)) || []
  for (const lc of logoColors) {
    const match = clusters.find((c) => distance(c.seed, lc.color) < 70)
    if (match) {
      match.inLogo = true
      match.score = match.score * 1.4 + 3
    } else if (lc.share >= 0.15) {
      // The logo's colour with nothing on the page backing it: still the
      // brand, since the logo is the brand, but only as strong as its share.
      clusters.push({ seed: lc.color, score: 3 + lc.share * 6, buttons: 0, inLogo: true, whys: new Set(['logo']) })
    }
  }

  clusters.sort((a, b) => b.score - a.score)
  const brand = clusters[0]
  if (!brand || brand.score < MIN_BRAND_SCORE) {
    return {
      ok: false,
      reason: brand
        ? `no colour is used enough to call it their brand (strongest: ${toHex(brand.seed)}, used ${brand.score.toFixed(1)} times against a bar of ${MIN_BRAND_SCORE})`
        : 'the page uses no colour of its own — only greys, whites and plugin defaults',
      evidence,
    }
  }

  const describe = (c: Cluster) => {
    const bits: string[] = []
    if (c.buttons) bits.push(`${c.buttons} button${c.buttons === 1 ? '' : 's'}`)
    if (c.whys.has('brand')) bits.push('menu/headings')
    if (c.inLogo) bits.push('the logo')
    return `${toHex(c.seed)} (${bits.length ? bits.join(', ') : 'used across the page'})`
  }

  // A DARK BASE. A site built on black with one strong colour is a
  // black-and-that-colour brand, not a that-colour brand: painting every tint
  // on the page in red would be a different shop. Three independent signals,
  // any one enough — the page says so (theme-color, body background) or the
  // logo was drawn for a dark background.
  const themeColor = themeColorOf(input.html)
  const bodyBg = bodyBackgroundOf(inline)
  const saysDark =
    (themeColor && isDarkNeutral(themeColor) ? themeColor : null) ||
    (bodyBg && isDarkNeutral(bodyBg) ? bodyBg : null) ||
    (input.logo?.surface === 'dark' ? { r: 17, g: 17, b: 17 } : null)
  const darkBase = saysDark ? darkSurfaceOf(inline, vars) || saysDark : null

  // The call to action: the strongest OTHER colour the site puts on buttons,
  // or failing that, the next distinct colour it uses.
  const others = clusters.filter(
    (c) => c !== brand && hueGap(hsl(c.seed).h, hsl(brand.seed).h) >= MIN_ACCENT_HUE_GAP && c.score >= brand.score * 0.3
  )
  const buttonOther = others.find((c) => c.buttons > 0 && c.buttons >= brand.buttons)
  const second = others[0] || null

  if (darkBase) {
    evidence.push(
      themeColor && isDarkNeutral(themeColor)
        ? `a dark base: the site declares theme-color ${toHex(themeColor)}`
        : bodyBg && isDarkNeutral(bodyBg)
          ? `a dark base: the page background is ${toHex(bodyBg)}`
          : 'a dark base: the logo is drawn for a dark background'
    )
    evidence.push(`call to action ${describe(brand)}`)
    return { ok: true, primary: toHex(darkBase), accent: toHex(brand.seed), secondary: null, evidence }
  }

  evidence.push(`brand ${describe(brand)}`)
  const accent = buttonOther || null
  if (accent) evidence.push(`call to action ${describe(accent)}`)
  return {
    ok: true,
    primary: toHex(brand.seed),
    accent: accent ? toHex(accent.seed) : null,
    // Only a second colour the site genuinely leans on, used literally and
    // not merely routed through a theme's palette: EliteProGlass's stock
    // theme blue made it this far and is on nothing a visitor sees.
    secondary: second && second !== accent && second.score >= brand.score * 0.6 ? toHex(second.seed) : null,
    evidence,
  }
}

// ---- who may be overwritten -------------------------------------------------

/** What a client is created with when nobody chooses (prisma/schema.prisma). */
export const PLATFORM_DEFAULT_COLORS = {
  primaryColor: '#1e40af',
  secondaryColor: '#3b82f6',
  accentColor: '#f59e0b',
} as const

/**
 * May a reading from the website replace this client's colours?
 *
 * Yes when they came from the website last time, or when they are still the
 * platform's defaults — the Branding card in the report that started this
 * showed exactly those three, untouched. NO when anybody chose them: a colour
 * an operator picked is a decision, and a scan that silently reverted it
 * every morning is a card nobody could trust.
 */
export function colorsAreReplaceable(client: {
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  brandColorsSource: string | null
}): boolean {
  if (client.brandColorsSource === 'manual') return false
  if (client.brandColorsSource === 'site') return true
  const same = (a: string | null, b: string) => !a || a.toLowerCase() === b
  return (
    same(client.primaryColor, PLATFORM_DEFAULT_COLORS.primaryColor) &&
    same(client.secondaryColor, PLATFORM_DEFAULT_COLORS.secondaryColor) &&
    same(client.accentColor, PLATFORM_DEFAULT_COLORS.accentColor)
  )
}

/**
 * The page is one THIS PLATFORM renders — a `websiteUrl` still pointing at
 * the shop's domain after the cutover. Reading it would read our own template
 * back and call the default blue their brand.
 */
export function isOurOwnSite(html: string): boolean {
  return /class\s*=\s*["'][^"']*\bgl-site\b/.test(html)
}
