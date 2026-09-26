/**
 * NOTHING HERE MAY PROMISE A TIMEFRAME OR AN INVENTORY.
 *
 * This copy renders on 15 different shops' sites, so a sentence is only
 * allowed if it is true for every one of them. "Most chip repairs take well
 * under an hour", "door glass is in stock", "we do it in the same
 * appointment" and "replaced quickly" all shipped here and all had to come
 * out: the platform cannot promise scheduling or stock on a shop's behalf,
 * and CLAUDE.md §2 says so. Insurance wording belongs in insurance-rules.ts,
 * which is compliance-reviewed — reuse it rather than restating it here.
 */
/**
 * Service definitions for hosted client landing pages.
 *
 * Shared by the home page (services grid + nav) and the per-service pages.
 * All copy here is generic to the trade — what the service IS — and never
 * asserts facts about a specific business (staffing, certifications, prices,
 * time promises). Business-specific claims come from the Client record or
 * stay off the page. This mirrors the landing-template compliance rules.
 */

export type ServiceFlag =
  | 'offersWindshieldReplacement'
  | 'offersWindshieldRepair'
  | 'offersRockChipRepair'
  | 'offersSideWindowRepair'
  | 'offersBackWindowRepair'
  | 'offersSunroofRepair'
  | 'offersAdasCalibration'
  | 'offersMobileService'

/**
 * The flags that are KINDS OF GLASS WORK — every service except mobile.
 *
 * The drafters' and screens' `services` maps are keyed by this, not by
 * ServiceFlag, because mobile already travels beside them as its own
 * top-level fact (`offersMobileService`), with its own screen rules. Putting
 * it in the map too would give one fact two places to disagree — "they run a
 * mobile unit" in one line of a prompt and "work they do NOT do: mobile" in
 * the next.
 */
export type GlassServiceFlag = Exclude<ServiceFlag, 'offersMobileService'>

export interface ServicePage {
  slug: string
  flag: ServiceFlag
  name: string
  short: string
  heroLine: string
  /**
   * A section that is only true for a shop doing some OTHER work too renders
   * only when that flag is on — the copy rule is "true for every shop it
   * renders for", and a page can be offered by a shop missing the service a
   * paragraph talks about.
   */
  sections: Array<{ heading: string; body: string; requires?: ServiceFlag }>
  /**
   * Whether the quote form arrives with this service chosen. False for a way
   * of DELIVERING the work rather than a kind of glass: the form's service
   * list is glass types, and a lead that says only "mobile" does not say what
   * is broken.
   */
  preselect?: false
  /**
   * Resolved by the catch-all route, NOT rewritten in middleware.
   *
   * Middleware sends a flat service address straight to the service route,
   * ahead of the kept pages and redirects the catch-all checks first, and it
   * cannot read the database to know better. That was safe for the original
   * slugs, which existed before any shop had a kept page. A slug added later
   * may already be a KEPT page or a redirect on a live site — "mobile auto
   * glass" is exactly what an old site calls its mobile page — and putting it
   * in middleware would silently replace that shop's page with ours. Left to
   * the catch-all, their kept page or redirect wins and everyone else gets
   * the template page at the same flat address.
   */
  yieldsToKeptPages?: true
}

export const SERVICE_PAGES: ServicePage[] = [
  {
    slug: 'windshield-replacement',
    flag: 'offersWindshieldReplacement',
    name: 'Windshield Replacement',
    short: 'Full windshield replacement, correctly bonded and safety-checked before you drive.',
    heroLine: 'Full windshield replacement with quality glass and professional installation.',
    sections: [
      {
        heading: 'When replacement is the right call',
        body: 'Cracks longer than a dollar bill, damage in the driver’s line of sight, chips at the edge of the glass, or multiple points of damage usually mean the windshield should be replaced rather than repaired. A damaged windshield is a structural part of the vehicle — it supports the roof and gives airbags a surface to deploy against — so it’s not a cosmetic decision.',
      },
      {
        heading: 'What the job involves',
        body: 'The old glass is cut out, the pinch weld is cleaned and prepped, new urethane adhesive is applied, and the new windshield is set and aligned. The adhesive needs a safe drive-away time before the vehicle is back on the road — your installer will tell you exactly how long for the adhesive used on your job.',
      },
      {
        heading: 'Insurance',
        body: 'Windshield replacement is covered under the comprehensive portion of most auto policies. Depending on your deductible and your state, your out-of-pocket cost may be far less than you expect. Ask when you call — we can walk you through how your coverage applies before any work is done.',
      },
    ],
  },
  {
    slug: 'windshield-repair',
    flag: 'offersWindshieldRepair',
    name: 'Windshield Repair',
    short: 'Stop cracks before they spread and save your original windshield.',
    heroLine: 'Repair small windshield damage before it spreads into a full replacement.',
    sections: [
      {
        heading: 'Repair versus replacement',
        body: 'Chips smaller than a quarter and short cracks can often be repaired by injecting resin into the damaged area, restoring most of the glass’s strength and clarity. Repair keeps your original factory seal, takes far less time than replacement, and costs much less — but it only works while the damage is small. Temperature swings and road vibration make chips grow.',
      },
      {
        heading: 'Why sooner is cheaper',
        body: 'A chip that would have been a simple repair can become a spreading crack after one cold morning or one hard pothole. Once a crack reaches the edge of the glass or crosses the driver’s view, replacement is usually the only safe option. If you are looking at fresh damage, getting it assessed early is the cheapest decision you can make.',
      },
      {
        heading: 'Insurance',
        body: 'Many insurers cover chip repair at no cost to you — they would rather pay for a repair now than a replacement later. Ask us to check how your policy handles glass repair.',
      },
    ],
  },
  {
    slug: 'rock-chip-repair',
    flag: 'offersRockChipRepair',
    name: 'Rock Chip Repair',
    short: 'Chip repair stops the damage spreading — and carriers usually waive the deductible, so often nothing out of pocket.',
    heroLine: 'Resin repair for rock chips, stars, and bullseyes.',
    sections: [
      {
        heading: 'What can be repaired',
        body: 'Star breaks, bullseyes, and combination chips up to roughly the size of a quarter are usually repairable if they haven’t contaminated with dirt and water. The repair injects resin under pressure into the break, then cures it with UV light — the damage stops spreading and becomes far less visible.',
      },
      {
        heading: 'Act before the weather does',
        body: 'A fresh chip is the best candidate for repair. Moisture and grime work into the break over days, and temperature changes flex the glass until the chip legs out into a crack. A repair is a far smaller job than a replacement — ask when you call.',
      },
      {
        heading: 'Insurance',
        body: 'Chip repair is the case insurers most often cover in full, because it saves them the cost of a replacement claim. It’s worth a phone call before assuming you’ll pay out of pocket.',
      },
    ],
  },
  {
    slug: 'side-window-replacement',
    flag: 'offersSideWindowRepair',
    name: 'Side Window Replacement',
    short: 'Broken door glass replaced, with full cleanup.',
    heroLine: 'Door glass replacement after a break-in, accident, or failure.',
    sections: [
      {
        heading: 'Tempered glass breaks all at once',
        body: 'Side windows are tempered glass — designed to shatter into small granular pieces rather than shards. That’s safer in a crash, but it means a broken side window is a pile of glass in your door, seat tracks, and carpet. A proper replacement includes vacuuming the glass out of the door cavity and interior, not just setting new glass.',
      },
      {
        heading: 'Weather and security',
        body: 'An open window is an open car. If you cannot get it in straight away, cover the opening. We will confirm the right glass for your vehicle when you call.',
      },
    ],
  },
  {
    slug: 'back-glass-replacement',
    flag: 'offersBackWindowRepair',
    name: 'Back Glass Replacement',
    short: 'Rear windshield and defroster grid replacement.',
    heroLine: 'Rear windshield replacement including the defroster connection.',
    sections: [
      {
        heading: 'More than a pane of glass',
        body: 'Back glass usually carries the defroster grid, and often antenna elements or brake-light mounts. Replacement means transferring or reconnecting those systems correctly, cleaning shattered tempered glass out of the trunk and rear deck, and sealing the new glass against leaks.',
      },
      {
        heading: 'Insurance',
        body: 'Like windshields, back glass falls under comprehensive coverage on most policies. We can help you understand what your policy covers before work begins.',
      },
    ],
  },
  {
    slug: 'sunroof-repair',
    flag: 'offersSunroofRepair',
    name: 'Sunroof Repair',
    short: 'Sunroof and moonroof glass repair and replacement.',
    heroLine: 'Sunroof and moonroof glass replacement and leak diagnosis.',
    sections: [
      {
        heading: 'Glass, tracks, and drains',
        body: 'Sunroof problems come in three flavors: broken or leaking glass, failed tracks and motors, and clogged drain tubes that dump water into the headliner. Glass replacement restores the panel itself; if water is appearing inside the cabin, the drains should be checked at the same time.',
      },
      {
        heading: 'Don’t drive with an open hole',
        body: 'A shattered sunroof exposed to weather damages the headliner and the electronics below it. A temporary cover is a stopgap, not a fix — get it assessed.',
      },
    ],
  },
  {
    slug: 'adas-calibration',
    flag: 'offersAdasCalibration',
    name: 'ADAS Calibration',
    short: 'If your car has lane-keep or automatic braking, the camera behind the glass has to be recalibrated. We handle calibration in-house, so there is no second trip to a dealer.',
    heroLine: 'Recalibration for lane-keep, emergency braking, and driver-assist cameras.',
    sections: [
      {
        heading: 'Why calibration is required',
        body: 'Most vehicles built in the last decade mount a camera behind the windshield that feeds lane departure warning, automatic emergency braking, and adaptive cruise control. Replacing the windshield moves that camera — even a small change in angle points it meters off target at highway distance. Manufacturers require recalibration after windshield replacement for these systems to work as designed.',
      },
      {
        heading: 'Static and dynamic calibration',
        body: 'Depending on the vehicle, calibration is done with targets in a controlled space (static), by driving the vehicle under specific conditions (dynamic), or both. It’s precision work with manufacturer procedures — which is why not every glass company offers it, and why it matters that yours does.',
      },
      {
        heading: 'One appointment, not two',
        body: 'Having replacement and calibration done together means the vehicle leaves with its safety systems verified, instead of driving uncalibrated to a second appointment at a dealership.',
      },
    ],
  },
  {
    // A way of delivering the work rather than a kind of glass, so it names
    // no glass it cannot vouch for: a mobile shop may do chips and nothing
    // else. Every sentence is true for any shop with the mobile box ticked —
    // no radius, no response time, no "same day", nothing about roadside
    // (a shop that comes to a driveway may not come to a hard shoulder).
    slug: 'mobile-auto-glass',
    flag: 'offersMobileService',
    name: 'Mobile Auto Glass Service',
    short: 'We come to you — at home or at work, inside our service area.',
    // Not "so you do not have to bring it in": the premises screen refuses it,
    // rightly — on a shop with no premises it implies somewhere to bring it.
    heroLine: 'Auto glass work done where your car is already parked — at home or at work.',
    preselect: false,
    yieldsToKeptPages: true,
    sections: [
      {
        heading: 'How mobile service works',
        body: 'Tell us the year, make and model, what is damaged, and where the vehicle will be. The technician brings what the job needs to that spot and does the work there — the same materials and the same job it would be anywhere else, without you having to drive a damaged car to it.',
      },
      {
        heading: 'Where the work can be done',
        body: 'A driveway, a garage or a parking space usually works, as long as there is room to open the doors and work around the vehicle. If the car will be at your workplace, check that it can stay where it is for the job and for the time the work needs afterwards before it is driven.',
      },
      {
        // Adhesive is a replacement fact. A shop doing only chip repair on
        // the road has no adhesive cure to talk about.
        heading: 'Weather and drive-away time',
        body: 'The adhesive that holds a windshield in place has a minimum safe drive-away time, and cold or wet weather affects how it cures. For outdoor work, tell us where the car will be parked when you book so the job can be planned around it. Your installer will tell you when it is safe to drive.',
        requires: 'offersWindshieldReplacement',
      },
      {
        // Only for a shop that calibrates at all. For one that does not, the
        // honest sentence is "somebody else will have to", and that belongs
        // in a conversation, not on their own page.
        heading: 'If your car has a camera behind the glass',
        body: 'Lane-keep, automatic braking and similar systems read the road through a camera mounted behind the windshield, and it has to be recalibrated after a replacement. Some calibrations need a controlled space rather than a driveway, so ask how it will be handled for your vehicle when you book.',
        requires: 'offersAdasCalibration',
      },
    ],
  },
]

export function servicesForClient(flags: Record<ServiceFlag, boolean>): ServicePage[] {
  return SERVICE_PAGES.filter((s) => flags[s.flag])
}

/** The pages that are a kind of glass work — see GlassServiceFlag. */
export const GLASS_SERVICE_PAGES = SERVICE_PAGES.filter(
  (s): s is ServicePage & { flag: GlassServiceFlag } => s.flag !== 'offersMobileService'
)

/**
 * Addresses the shops' OLD sites used for a service this template names
 * differently — every key is a live final URL in a client's Ads account.
 *
 * Each one carries its own NAME, and that is the point of the map rather than
 * just a redirect table. Somebody who searched "auto glass replacement",
 * clicked an ad pointing at /auto-glass-replacement, and landed on a page
 * headed "Windshield Replacement" has been told, in the largest words on the
 * screen, that they are somewhere else. The page underneath is the right one;
 * only its title was wrong. Message match on a paid click is not decoration —
 * it is the first thing the visitor checks and the thing Google's landing
 * page experience score reads.
 *
 * The names are written out, never derived from the slug. Title-casing turns
 * "adas-calibration" into "Adas Calibration", and the list is short and fixed.
 */
export const SERVICE_ALIASES: Record<string, { service: string; name: string }> = {
  'auto-glass-replacement': { service: 'windshield-replacement', name: 'Auto Glass Replacement' },
  'mobile-windshield-replacement': {
    service: 'windshield-replacement',
    name: 'Mobile Windshield Replacement',
  },
  'auto-glass-repair': { service: 'windshield-repair', name: 'Auto Glass Repair' },
  'mobile-windshield-repair': { service: 'windshield-repair', name: 'Mobile Windshield Repair' },
  'windshield-crack-repair': { service: 'windshield-repair', name: 'Windshield Crack Repair' },
  'windshield-chip-repair': { service: 'rock-chip-repair', name: 'Windshield Chip Repair' },
}

/**
 * The page an address serves — its own slug, or the one it is an alias for.
 *
 * Aliases resolve here rather than only in middleware, so the flat address
 * also works on the /sites/{slug} preview, which is the one place an operator
 * checks a site before pointing a domain at it.
 */
export function getServicePage(slug: string): ServicePage | undefined {
  const direct = SERVICE_PAGES.find((s) => s.slug === slug)
  if (direct) return direct
  const alias = SERVICE_ALIASES[slug]
  return alias ? SERVICE_PAGES.find((s) => s.slug === alias.service) : undefined
}

/**
 * What the page calls itself AT THIS ADDRESS.
 *
 * The service's own name everywhere except an alias, where it is the alias's
 * name — the words the visitor typed and the ad promised.
 */
export function serviceHeading(slug: string): string {
  return SERVICE_ALIASES[slug]?.name || getServicePage(slug)?.name || ''
}

/**
 * Every flat address MIDDLEWARE resolves to a service page.
 *
 * Not every service page: one marked `yieldsToKeptPages` is served at its
 * flat address by the catch-all instead, after the shop's kept pages and
 * redirects have had their turn — see the note on that field.
 */
export const FLAT_SERVICE_PATHS: string[] = [
  ...SERVICE_PAGES.filter((s) => !s.yieldsToKeptPages).map((s) => s.slug),
  ...Object.keys(SERVICE_ALIASES),
]

/** The service's own sections that are true for THIS shop. */
export function sectionsFor(
  page: ServicePage,
  flags: Partial<Record<ServiceFlag, boolean | null>>
): Array<{ heading: string; body: string }> {
  return page.sections
    .filter((s) => !s.requires || !!flags[s.requires])
    .map(({ heading, body }) => ({ heading, body }))
}
