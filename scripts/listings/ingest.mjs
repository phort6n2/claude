// Validate + merge agent-sourced listings into the seed file shape.
// Rejects rather than repairs anything it cannot verify, and reports why.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const ROOT = '/home/user/claude'
const IN_DIR = new URL('./agent-out/', import.meta.url).pathname
const existing = JSON.parse(readFileSync(`${ROOT}/src/data/directory-shops.json`, 'utf8'))

const SERVICES = new Set([
  'windshield-replacement', 'windshield-repair', 'chip-repair', 'adas-calibration',
  'mobile-service', 'side-window', 'rear-window', 'power-window-repair',
  'sunroof-repair', 'window-tint', 'commercial-fleet', 'rv-heavy-equipment',
])

const STATE_NAMES = {
  al:'Alabama',ak:'Alaska',az:'Arizona',ar:'Arkansas',ca:'California',co:'Colorado',
  ct:'Connecticut',de:'Delaware',fl:'Florida',ga:'Georgia',hi:'Hawaii',id:'Idaho',
  il:'Illinois',in:'Indiana',ia:'Iowa',ks:'Kansas',ky:'Kentucky',la:'Louisiana',
  me:'Maine',md:'Maryland',ma:'Massachusetts',mi:'Michigan',mn:'Minnesota',
  ms:'Mississippi',mo:'Missouri',mt:'Montana',ne:'Nebraska',nv:'Nevada',
  nh:'New Hampshire',nj:'New Jersey',nm:'New Mexico',ny:'New York',
  nc:'North Carolina',nd:'North Dakota',oh:'Ohio',ok:'Oklahoma',or:'Oregon',
  pa:'Pennsylvania',ri:'Rhode Island',sc:'South Carolina',sd:'South Dakota',
  tn:'Tennessee',tx:'Texas',ut:'Utah',vt:'Vermont',va:'Virginia',wa:'Washington',
  wv:'West Virginia',wi:'Wisconsin',wy:'Wyoming',dc:'Washington, D.C.',
}

// Franchises/chains we deliberately exclude, plus non-auto-glass business types.
const CHAIN = /safelite|glass doctor|novus|speedy glass|gerber|caliber collision|\babra\b|boyd auto|crash champions|jiffy lube|maaco|ziebart|auto glass now|glass america|diamond triumph|nations? ?auto ?glass|jack morris|only 1 auto glass|auto glass fitters|binswanger|harmon auto ?glass|harmon glass/i
// Wholesalers/distributors. They sell glass to shops, not to drivers, so a
// listing sends the customer somewhere that won't serve them.
const DISTRIBUTOR = /\bmygrant\b|\bpgw\b|pilkington|\bvitro\b|glass depot|american glass (wholesale|distributors)/i

const NOT_AUTOGLASS = /shower|residential|storefront|window & door|windows and doors|mirror & shower|glazing contractor/i

// Descriptions that only restate "this appears in a directory under category X".
// They contain no information about the shop, so they'd publish as dead pages —
// and they signal the agent never got past an aggregator's category index.
const BOILERPLATE = new RegExp(
  [
    /\b(is|its?) (listing|listed)\b/.source,
    /\bcategori[sz]ed under\b/.source,
    // "listed under the auto, plate and window glass category"
    /\blisted (under|with|by|in) (the )?(auto|plate|window|windshield|the better business|yellow)/.source,
    // "according to its directory profile" / "Its directory profile lists it under"
    /\bdirectory (profile|listing)\b/.source,
    /\baccording to its listing\b/.source,
    // The "auto, plate and window glass" phrase is a YellowPages category name,
    // never how a shop describes itself.
    /\bauto,? plate and window glass\b/.source,
  ].join('|'),
  'i'
)

// The example object in the sourcing prompt, echoed back as if it were a real
// shop. Four separate agents did this; only the first slipped through, because
// the rest collided on its phone number. Reject it by name, phone and domain —
// a fabricated listing is the single worst thing that can reach the directory.
const PLACEHOLDER = {
  name: /^acme auto glass$/i,
  phone: /^\d{3}555\d{4}$/,
  host: /^(www\.)?acmeautoglass\.com$/i,
  street: /^123 main st/i,
}

// Phone numbers that cannot belong to a real business. 555-01xx is the range
// reserved for fiction, and 555-1234 is the placeholder every template ships
// with — one agent found a lead-gen shell publishing exactly that.
const FAKE_PHONE = /^\d{3}(5550(1\d\d|100)|5551234|0000000|1234567|1111111)$/

// A confirmed lead-gen operation, verified rather than merely suspected.
//
// Four brands — Best Car Glass, Jacks Auto Glass, Flys Auto Glass, Faster
// Windshields — published from one Wix template farm on default
// admin#####.wixsite.com subdomains, claiming the same ~83 locations across
// the same four states under names supposedly founded three years apart.
//
// What proved it was not the naming. It was the phone numbers: 786-707-4418
// is "Flys" and 786-707-4419 is "Jacks"; 954-633-2196 is "Faster" and
// 954-633-2236 is "Best Car Glass". Independent businesses in different cities
// do not draw from one DID block. And every address we checked hosts something
// else — a 1913 single-family house, a brewery, a roofing warehouse.
//
// Name repetition alone is NOT evidence: this directory holds 18 unrelated
// "Low Price Auto Glass" shops across 16 area codes and they are real. Shared
// telephone infrastructure is the signal.
// ABC Windshield and Time Windshield came out of sweeping the phone blocks
// above, not from a new report. ABC publishes from the same Wix farm
// (admin489088.wixsite.com/abcwindshield) and claims 61 locations in 15
// states; its Dearborn Heights address is The BoneYard Bar-B-Q, a restaurant
// trading there since 1972.
//
// ABC also had a real custom domain, abcwindshield.com, serving a near-empty
// page — a citation token existing only to fill the "website" field. So a
// website is not evidence either way; only what is behind it counts.
const FAKE_NETWORK = /^(best car glass|jacks? auto ?glass|flys? auto ?glass|faster windshields?|abc windshields?|time windshields?)$/i
const FAKE_BLOCKS = /^(786707|954633|954623|407358|727509|786522|786361|407378|941257|602535|727470|313736|323203|303731|704837)/

// Claims we cannot verify and the brief forbids inventing.
const UNVERIFIABLE = /\b\d(\.\d)?\s*(star|stars)\b|\b\d+\+?\s*(years?|yrs)\b|\b\d+\s*(reviews?|ratings?)\b|award[- ]winning|\bbest\b in|#1\b|top[- ]rated|highest[- ]rated|voted\b|guarantee[ds]?\b.*lifetime|A\+ rated/i

// Neighbourhoods that are legally part of a larger city, keyed "neighbourhood|state".
//
// Agents sourcing Boston correctly returned shops in Dorchester, Brighton and
// East Boston — all of which ARE Boston. Filed under their own names they'd
// create six thin one-shop pages while /directory/ma/boston stayed empty, and
// someone searching "auto glass Boston" would find nothing. USPS accepts
// "Boston" as the city for all of these ZIPs.
//
// Deliberately narrow. NYC boroughs are NOT merged — "auto glass Brooklyn" is a
// strong query in its own right — and Los Angeles districts (Van Nuys,
// Northridge, Encino) are left alone for the same reason.
const NEIGHBOURHOOD_OF = {
  'allston|ma': 'Boston', 'brighton|ma': 'Boston', 'charlestown|ma': 'Boston',
  'dorchester|ma': 'Boston', 'dorchester center|ma': 'Boston',
  'east boston|ma': 'Boston', 'hyde park|ma': 'Boston',
  'jamaica plain|ma': 'Boston', 'mattapan|ma': 'Boston',
  'roslindale|ma': 'Boston', 'roxbury|ma': 'Boston',
  'roxbury crossing|ma': 'Boston', 'south boston|ma': 'Boston',
  'west roxbury|ma': 'Boston', 'mission hill|ma': 'Boston',
  'readville|ma': 'Boston', 'brighton center|ma': 'Boston',
}

// Agents sometimes return names/descriptions scraped as HTML, so "&" arrives as
// "&amp;". Left alone that renders literally on the live listing page.
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&ndash;/g, '–')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .trim()

const slugify = (s) => (s || '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const digits = (s) => (s || '').replace(/\D/g, '')

function fmtPhone(raw) {
  const d = digits(raw)
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return n.length === 10 ? `(${n.slice(0,3)}) ${n.slice(3,6)}-${n.slice(6)}` : null
}

// ---- indexes of what we already have -------------------------------------
const takenSlug = new Set(existing.map(s => s.slug))
const seenKey = new Set(existing.map(s => `${normName(s.name)}|${slugify(s.city)}`))
// Phone → the normalised name that claimed it. A shared number across DIFFERENT
// names means bad data, but a chain running one central line across several
// branches is legitimate — Granite State Glass has seven New Hampshire shops.
// Keying on name lets branches through while still catching real duplicates,
// which name+city already handles.
const phoneOwner = new Map()
for (const s of existing) {
  const d = digits(s.phone)
  if (d.length === 10 && !phoneOwner.has(d)) phoneOwner.set(d, normName(s.name))
}

// ---- load agent output ----------------------------------------------------
let raw = []
for (const f of readdirSync(IN_DIR).filter(f => f.endsWith('.json'))) {
  const txt = readFileSync(IN_DIR + f, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(txt)
  } catch {
    // tolerate a stray markdown fence around otherwise-valid JSON
    const m = txt.match(/\[[\s\S]*\]/)
    if (!m) { console.error(`SKIP ${f}: unparseable`); continue }
    try { parsed = JSON.parse(m[0]) } catch { console.error(`SKIP ${f}: unparseable`); continue }
  }
  if (!Array.isArray(parsed)) { console.error(`SKIP ${f}: not an array`); continue }
  raw.push(...parsed.map(r => ({ ...r, _file: f })))
}

// ---- validate ------------------------------------------------------------
// Records rejected after checking them by hand. Kept here rather than edited out
// of the agent output so the decision survives a re-extract and stays auditable.
const MANUAL_EXCLUSIONS = {
  // Claimed 1000 Westbank Expy, Gretna — an address Star Glass publishes in its
  // own schema.org markup. autoglassnola.com serves fine but lists no street
  // address anywhere, so this one is unverifiable and would have pointed
  // customers at a different company's shop.
  'nolaautoglasspros': 'address belongs to another business; unverifiable on its own site',
}

const accepted = []
const rejected = []
const flagged = []
// Two differently-named shops at one street address. Sometimes genuine (shared
// commercial building, a rebrand still trading under both names), sometimes a
// sign the agent conflated two records. Reported rather than rejected, so it
// gets a human look instead of a silent decision either way.
// Lead-gen spam clusters. Agents keep finding the same network in city after
// city — Hampton, Newark, Akron, Cleveland, Jacksonville — a run of
// differently-named shops ("Veracious Auto Glass", "Honorable Auto Glass",
// "Steadfast Auto Glass") on sequential numbers in one telephone exchange, all
// funnelling to the same landing page.
//
// Neither half is damning alone: an adjective is a fine name, and one exchange
// can legitimately serve several businesses. Together, in one city, they are
// the signature. Reported rather than rejected — the call belongs to a person.
const SPAMMY_ADJECTIVE = /^(veracious|honorable|honest|sure|positive|tried|steadfast|unequivocal|dependable|principled|responsible|reliable|trustworthy|prudent|diligent|earnest|candid|genuine|sincere|upright|scrupulous)\b/i
const exchangeOwner = new Map()
const spamClusters = []

const addressOwner = new Map()
const addressCollisions = []

const rej = (r, why) => rejected.push({ name: r.name ?? '(no name)', city: r.city ?? '?', why, file: r._file })

for (const r of raw) {
  if (!r || typeof r !== 'object') { rej({}, 'not an object'); continue }

  for (const f of ['name', 'phone', 'street', 'city', 'state', 'zip', 'description', 'source']) {
    if (!r[f] || typeof r[f] !== 'string' || !r[f].trim()) { rej(r, `missing ${f}`); r._bad = 1; break }
  }
  if (r._bad) continue

  // Decode before any matching/storage so "&amp;" never reaches the live page.
  r.name = decodeEntities(r.name)
  r.description = decodeEntities(r.description)
  r.city = decodeEntities(r.city)
  r.street = decodeEntities(r.street)

  // Fold city neighbourhoods into their parent city BEFORE dedupe and slugging,
  // so two Dorchester shops become two Boston shops rather than two separate
  // one-shop pages.
  const parent = NEIGHBOURHOOD_OF[`${r.city.trim().toLowerCase()}|${String(r.state).toLowerCase().trim()}`]
  if (parent) r.city = parent

  if (!/^https?:\/\//i.test(r.source)) { rej(r, 'source is not a URL'); continue }

  // Source tiering. A search-engine QUERY url is not evidence — it just proves
  // someone ran a search — so those are rejected outright. Aggregator listings
  // are accepted but recorded, since scraped data goes stale and those are the
  // entries worth phone-verifying before trusting.
  if (
    /(?:google|bing|duckduckgo|search\.yahoo|yandex|mojeek)\.[a-z.]+\/(?:search|url)\b|\?(?:q|p)=/i.test(r.source) ||
    // Any site's own search page with a query — a results list, not a profile.
    /\/search\?/i.test(r.source)
  ) {
    rej(r, 'source is a search query, not a verifiable page')
    continue
  }
  const AGGREGATORS = /yellowpages|superpages|bbb\.org|checkbook\.org|nextdoor|yelp|cmac\.ws|shieldfinder|glassandauto|manta|mapquest|angi|thumbtack/i
  let sourceTier = 'other'
  try {
    const srcHost = new URL(r.source).hostname.replace(/^www\./, '')
    const siteHost = r.website ? new URL(r.website).hostname.replace(/^www\./, '') : null
    if (siteHost && srcHost === siteHost) sourceTier = 'own-site'
    else if (AGGREGATORS.test(r.source)) sourceTier = 'aggregator'
  } catch { /* leave as other */ }
  const manual = MANUAL_EXCLUSIONS[normName(r.name)]
  if (manual) { rej(r, `manually excluded: ${manual}`); continue }

  // Placeholder check runs before everything else — this is fabricated data.
  {
    let host = null
    try { host = r.website ? new URL(r.website).hostname : null } catch { /* ignore */ }
    if (
      PLACEHOLDER.name.test(r.name.trim()) ||
      PLACEHOLDER.phone.test(digits(r.phone)) ||
      (host && PLACEHOLDER.host.test(host)) ||
      PLACEHOLDER.street.test(String(r.street).trim())
    ) {
      rej(r, 'placeholder from the prompt example, not a real shop')
      continue
    }
  }
  if (CHAIN.test(r.name)) { rej(r, 'national chain/franchise'); continue }
  if (DISTRIBUTOR.test(r.name)) { rej(r, 'distributor, not a shop'); continue }
  if (FAKE_PHONE.test(digits(r.phone))) { rej(r, 'placeholder phone number'); continue }
  if (FAKE_NETWORK.test(String(r.name).trim())) { rej(r, 'known lead-gen network'); continue }
  if (FAKE_BLOCKS.test(digits(r.phone))) { rej(r, 'phone in a known lead-gen DID block'); continue }
  if (NOT_AUTOGLASS.test(r.name)) { rej(r, 'not an auto glass specialist'); continue }

  const state = String(r.state).toLowerCase().trim()
  if (!STATE_NAMES[state]) { rej(r, `bad state "${r.state}"`); continue }

  const zip = String(r.zip).trim().match(/^\d{5}/)
  if (!zip) { rej(r, `bad zip "${r.zip}"`); continue }

  const phone = fmtPhone(r.phone)
  if (!phone) { rej(r, `bad phone "${r.phone}"`); continue }

  const services = Array.isArray(r.services) ? r.services.filter(s => SERVICES.has(s)) : []
  if (!services.length) { rej(r, 'no valid services'); continue }

  if (String(r.description).trim().length < 40) { rej(r, 'description too thin'); continue }
  if (BOILERPLATE.test(r.description)) { rej(r, 'description is directory boilerplate, not real detail'); continue }

  // Dedupe: same name in same city, or the same phone number anywhere.
  const key = `${normName(r.name)}|${slugify(r.city)}`
  if (seenKey.has(key)) { rej(r, 'duplicate (name+city)'); continue }
  const pd = digits(phone)
  const owner = phoneOwner.get(pd)
  if (owner && owner !== normName(r.name)) {
    rej(r, 'phone already belongs to a differently-named shop')
    continue
  }
  seenKey.add(key)
  if (!owner) phoneOwner.set(pd, normName(r.name))

  const addrKey = `${String(r.street).toLowerCase().replace(/[^a-z0-9]/g, '')}|${slugify(r.city)}|${state}`
  const addrOwner = addressOwner.get(addrKey)
  if (addrOwner && addrOwner !== normName(r.name)) {
    addressCollisions.push(`${r.name} shares ${r.street}, ${r.city} with a differently-named shop`)
  }
  if (!addrOwner) addressOwner.set(addrKey, normName(r.name))

  // Same city, same telephone exchange, adjective-led name — see the note by
  // SPAMMY_ADJECTIVE. Collected now, judged after every record is in.
  const exKey = `${pd.slice(0, 6)}|${slugify(r.city)}|${state}`
  const ex = exchangeOwner.get(exKey) || { names: new Set(), adjectives: 0 }
  ex.names.add(normName(r.name))
  if (SPAMMY_ADJECTIVE.test(r.name)) ex.adjectives++
  exchangeOwner.set(exKey, ex)

  // Strip unverifiable boasts from the description rather than dropping the shop.
  let description = String(r.description).trim().replace(/\s+/g, ' ')
  if (UNVERIFIABLE.test(description)) {
    flagged.push({ name: r.name, city: r.city, description })
    description = description
      .split(/(?<=[.!?])\s+/)
      .filter(sent => !UNVERIFIABLE.test(sent))
      .join(' ')
      .trim()
    if (description.length < 40) { rej(r, 'description was all unverifiable claims'); continue }
  }

  // Unique slug, matching the seed convention (name, then name-city, then -N).
  let slug = slugify(r.name)
  if (!slug) { rej(r, 'name does not slugify'); continue }
  if (takenSlug.has(slug)) slug = `${slugify(r.name)}-${slugify(r.city)}`
  if (takenSlug.has(slug)) {
    let i = 2
    while (takenSlug.has(`${slugify(r.name)}-${i}`)) i++
    slug = `${slugify(r.name)}-${i}`
  }
  takenSlug.add(slug)

  const website = typeof r.website === 'string' && /^https?:\/\//i.test(r.website)
    ? r.website : undefined

  accepted.push({
    slug,
    name: String(r.name).trim(),
    phone,
    ...(website ? { website } : {}),
    street: String(r.street).trim(),
    city: String(r.city).trim(),
    state,
    stateFull: STATE_NAMES[state],
    zip: zip[0],
    services,
    mobileService: r.mobileService === true || services.includes('mobile-service'),
    insurance: [],
    hours: [],
    description,
    claimed: false,
    featured: false,
    _source: r.source,
    _sourceTier: sourceTier,
  })
}

// ---- report --------------------------------------------------------------
const byReason = {}
for (const r of rejected) byReason[r.why] = (byReason[r.why] || 0) + 1
const byState = {}
for (const a of accepted) byState[a.state] = (byState[a.state] || 0) + 1

for (const [key, ex] of exchangeOwner) {
  if (ex.names.size >= 3 && ex.adjectives >= 2) {
    spamClusters.push(`${key} — ${ex.names.size} differently-named shops, ${ex.adjectives} adjective-led`)
  }
}

console.log(`\n=== INGEST REPORT ===`)
console.log(`raw from agents : ${raw.length}`)
console.log(`ACCEPTED        : ${accepted.length}`)
console.log(`rejected        : ${rejected.length}`)
console.log(`\nrejection reasons:`)
Object.entries(byReason).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${String(v).padStart(4)}  ${k}`))
if (flagged.length) console.log(`\nunverifiable claims scrubbed from ${flagged.length} descriptions`)
if (addressCollisions.length) {
  console.log(`\nSPOT-CHECK — ${addressCollisions.length} shared street address(es):`)
  addressCollisions.forEach((c) => console.log('  ' + c))
}
console.log(`\naccepted by state:`)
console.log('  ' + Object.entries(byState).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join('  '))

writeFileSync(new URL('./accepted.json', import.meta.url).pathname, JSON.stringify(accepted, null, 1))
writeFileSync(new URL('./rejected.json', import.meta.url).pathname, JSON.stringify(rejected, null, 1))
if (spamClusters.length) {
  console.log(`\nPOSSIBLE LEAD-GEN CLUSTERS — ${spamClusters.length}:`)
  for (const c of spamClusters) console.log(`  ${c}`)
}

console.log(`\nwrote accepted.json (${accepted.length}) + rejected.json (${rejected.length})`)
