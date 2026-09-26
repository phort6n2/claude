/**
 * Reading a shop's colours off their website, and what the site does with
 * them.
 *
 * Run: npx tsx scripts/check-brand-colors.ts
 *
 * Both failures are silent. Read too eagerly and a black-and-red shop is
 * painted in a plugin's Bootstrap blue on its live site — every word renders,
 * nothing errors, and the shop is the only one who notices. Too timidly and
 * the button is pressed, nothing is found, and the defaults stay. The fixtures
 * are cut from REAL shop pages (EliteProGlass, Speedy, Auto Glass Kings); the
 * traps come first.
 */

import {
  colorsAreReplaceable,
  isOurOwnSite,
  readBrandScheme,
  PLATFORM_DEFAULT_COLORS,
} from '../src/lib/brand-colors'
import { sitePaletteVars } from '../src/lib/site-theme'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)
const eq = (label: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want) ? pass(label) : fail(`${label}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)

/* EliteProGlass, verbatim in the parts that matter: three variables NAMED
   primary, all blue and all somebody else's (The Post Grid, LatePoint, the
   Astra theme's stock palette); the theme routing its buttons, links and
   widget chrome through that palette; and the red the page actually shows,
   typed literally into the customizer's header button and menu. */
const ELITE = `<!doctype html><html><head>
<meta name="theme-color" content="#000000">
<style id="astra-theme-css-inline-css">
:root{--ast-global-color-0:#0089e4;--ast-global-color-1:#192730;--ast-global-color-5:#ffffff;}
a,.page-title{color:var(--ast-global-color-0);}
::selection{background-color:var(--ast-global-color-0);color:#ffffff;}
.tagcloud a:hover,.tagcloud a:focus{border-color:var(--ast-global-color-0);background-color:var(--ast-global-color-0);}
.secondary .calendar_wrap #today{background:var(--ast-global-color-0);}
button,.ast-button,.button,input[type="submit"]{border-color:var(--ast-global-color-0);background-color:var(--ast-global-color-0);}
.menu-toggle,button:hover,.ast-button:hover{background-color:var(--ast-global-color-1);}
.ast-header-button-1 .ast-custom-button{color:#d40000;background:rgba(25,3,3,0);}
.ast-builder-menu-1 .menu-item > .menu-link{color:#d40000;}
.ast-builder-menu-mobile .main-navigation .menu-item > .menu-link{color:#d40000;}
[data-section="section-header-mobile-trigger"] .ast-button-wrap .ast-mobile-menu-trigger-fill{background:#d40000;}
h2.elementor-heading-title{color:#d40000;}
</style>
<style id="latepoint-main-front-inline-css">:root{--latepoint-brand-primary:#1d7bff;}</style>
<style id="tpg-inline">:root{--tpg-primary-color:#0d6efd;--tpg-secondary-color:#0654c4;}</style>
<style id="global-styles-inline-css">:root{--wp--preset--color--vivid-red:#cf2e2e;--wp--preset--color--luminous-vivid-orange:#ff6900;}.has-vivid-red-color{color:var(--wp--preset--color--vivid-red)}</style>
<link rel='stylesheet' href='https://fonts-api.wp.com/css?family=Montserrat&#038;display=swap&#038;ver=4.13.10'>
</head><body><a class="elementor-button" style="background-color:#d40000">Get Quote</a>
<a class="social" style="color:#8a3ab9">Instagram</a><a class="social" style="color:#557dbc">Facebook</a>
</body></html>`

/* Speedy: the Kadence theme's palette reached only through var(), and the
   Call Now Button plugin's stock green written inline on the page — which
   outscored their blue until plugin elements were skipped. */
const SPEEDY_HTML = `<html><head></head><body>
<a class="call-now-button cnb-zoom-100 cnb-full" style="background-color:#009900;">Call</a>
<a class="call-now-button cnb-full" style="background-color:#009900;">Call</a>
</body></html>`
const SPEEDY_CSS = `:root{--global-palette1:#3182CE;--global-palette2:#2B6CB0;--global-palette3:#1A202C;--global-palette-btn-bg:var(--global-palette1);}
button,.button,.wp-block-button__link{background:var(--global-palette-btn-bg);}
.elementor-button-wrapper .elementor-button{background-color:var(--global-palette-btn-bg);}
#main-header .header-button{background:var(--global-palette1);}
:root{--global-palette-highlight:var(--global-palette1);}
a{color:var(--global-palette-highlight);}
.main-navigation .primary-menu-container > ul > li.current-menu-item > a{color:var(--global-palette-highlight);}
.header-button-wrap .header-button.button-style-secondary{background:var(--global-palette-btn-bg);}
.site-header-item a{color:var(--global-palette1);}
h1,h2{color:var(--global-palette3);}
.btn-danger{background-color:#d9534f}.btn-success{background-color:#5cb85c}.btn-info{background-color:#5bc0de}.btn-warning{background-color:#f0ad4e}
.button.is-link{background-color:#3273dc}.button.is-success{background-color:#23d160}`

/* Auto Glass Kings: charcoal site, yellow buttons, a white logo. */
const AGK = `<html><head><style>
.x-btn,.button.learn-more{background-color:#f5f45a;color:#1b1d29}
.x-btn.alt{background-color:#f5f45a}
h1.hero-title{color:#f5f45a}
.x-navbar{background-color:#0b0c10}
.x-section.hero{background-color:#1b1d29}.x-section.dark{background-color:#1b1d29}
.x-btn.outline{border-color:#255ce9}
</style></head><body></body></html>`

function main() {
  console.log('\nSILENT: nothing a shop did not choose becomes their colour')
  {
    const onlySocial = readBrandScheme({
      html: `<html><body><a style="color:#8a3ab9">IG</a><a style="background:#1877f2">FB</a><a style="color:#25d366">WA</a></body></html>`,
    })
    eq('a page whose only colour is social icons → no reading', onlySocial.ok, false)
    const frameworks = readBrandScheme({ html: '<html></html>', css: [SPEEDY_CSS.split(':root')[0] + '.btn-danger{background-color:#d9534f}.btn-primary{background-color:#0d6efd}.btn-success{background-color:#5cb85c}'] })
    eq('Bootstrap\'s button variants alone → no reading', frameworks.ok, false)
    const greys = readBrandScheme({
      html: `<html><head><meta name="theme-color" content="#222222"><style>.btn{background:#333}h1{color:#111}</style></head></html>`,
    })
    eq('a black-and-grey page with theme-color → no invented colour', greys.ok, false)
    const entity = readBrandScheme({
      html: `<html><head><style>.btn{background:url(x.png?a=1&#038;b=2)}</style></head><body><a href="#faq" class="btn">x</a></body></html>`,
    })
    eq('an HTML entity (&#038;) is not the colour #038', entity.ok, false)
    eq('the site THIS platform hosts is refused (reading it reads our defaults back)', isOurOwnSite('<div class="gl-site min-h-screen">'), true)
    eq('a shop site is not ours', isOurOwnSite(ELITE), false)
  }

  console.log('\nEliteProGlass: three blue "primary" variables, and the red the site shows')
  {
    const r = readBrandScheme({ html: ELITE })
    if (r.ok) {
      eq('base is their black (theme-color)', r.primary, '#000000')
      eq('call to action is their red, not a plugin blue', r.accent, '#d40000')
      eq('no secondary conjured from the theme\'s unused stock blue', r.secondary, null)
    } else fail(`no reading: ${r.reason}`)
    const withLogo = readBrandScheme({
      html: ELITE,
      logo: { colors: [{ color: { r: 214, g: 12, b: 12 }, share: 0.14 }], surface: 'dark' },
    })
    if (withLogo.ok && withLogo.accent === '#d40000' && withLogo.evidence.join(' ').includes('the logo')) {
      pass('the logo agrees, and the evidence says so')
    } else fail(`with logo: ${JSON.stringify(withLogo)}`)
  }

  console.log('\nSpeedy: a palette used through var(), a plugin\'s green inline')
  {
    const r = readBrandScheme({ html: SPEEDY_HTML, css: [SPEEDY_CSS] })
    if (r.ok) {
      eq('brand is their Kadence palette blue', r.primary, '#3182ce')
      eq('the Call Now Button plugin\'s green is not their accent', r.accent, null)
    } else fail(`no reading: ${r.reason}`)
  }

  console.log('\nAuto Glass Kings: charcoal site, yellow buttons, white logo')
  {
    const r = readBrandScheme({ html: AGK, logo: { colors: [], surface: 'dark' } })
    if (r.ok) {
      eq('base is the charcoal the page is built on, not a generic black', r.primary, '#1b1d29')
      eq('call to action is their yellow', r.accent, '#f5f45a')
    } else fail(`no reading: ${r.reason}`)
    const noLogo = readBrandScheme({ html: AGK })
    if (noLogo.ok && noLogo.primary === '#f5f45a') pass('without the dark-logo signal, yellow is the brand (and the base stays light)')
    else fail(`no-logo AGK: ${JSON.stringify(noLogo)}`)
  }

  console.log('\nWHO MAY BE OVERWRITTEN')
  {
    const d = { ...PLATFORM_DEFAULT_COLORS, brandColorsSource: null }
    eq('untouched defaults → replaceable', colorsAreReplaceable(d), true)
    eq('defaults in a different case → replaceable', colorsAreReplaceable({ ...d, primaryColor: '#1E40AF' }), true)
    eq('chosen by hand → never', colorsAreReplaceable({ ...d, brandColorsSource: 'manual' }), false)
    eq('read from the site last time → may be refreshed', colorsAreReplaceable({ ...d, primaryColor: '#d40000', brandColorsSource: 'site' }), true)
    eq('custom colours from before this existed → treated as chosen', colorsAreReplaceable({ ...d, primaryColor: '#b91c1c' }), false)
  }

  console.log('\nTHE CALL TO ACTION: unchanged unless the shop has its own colour for it')
  {
    const base = sitePaletteVars('#1e40af', '#f59e0b')
    eq('default blue + default amber → the button is the blue, as it always was', base['--cta'], '#1e40af')
    const navyRed = sitePaletteVars('#1e40af', '#dc2626')
    eq('navy brand + THEIR red → the button is the red', navyRed['--cta'], '#dc2626')
    const close = sitePaletteVars('#1e40af', '#2563eb')
    eq('an accent that is just another blue → the button stays the brand', close['--cta'], '#1e40af')
    const grey = sitePaletteVars('#1e40af', '#9ca3af')
    eq('a grey accent is not a colour → the brand', grey['--cta'], '#1e40af')
    const elite = sitePaletteVars('#000000', '#d40000')
    eq('EliteProGlass (black + red) → red button, white text', [elite['--cta'], elite['--on-cta']], ['#d40000', '#ffffff'])
    const agk = sitePaletteVars('#1b1d29', '#f5f45a')
    eq('Auto Glass Kings: charcoal counts as neutral → yellow button', agk['--cta'], '#f5f45a')
    eq('…with dark text on it', agk['--on-cta'], '#000000')
    if (agk['--sh-cta'].includes('inset 0 0 0 1.5px')) pass('…and an edge, because yellow on the white hero has no outline of its own')
    else fail('a pale button got no edge')
    if (!base['--sh-cta'].includes('inset')) pass('a deep button gets no ring (unchanged)')
    else fail('the default button changed its shadow')
  }

  console.log(failures === 0 ? '\nAll brand-colour checks passed.' : `\n${failures} brand-colour check${failures === 1 ? '' : 's'} FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
