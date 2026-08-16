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

export interface ServicePage {
  slug: string
  flag: ServiceFlag
  name: string
  short: string
  heroLine: string
  sections: Array<{ heading: string; body: string }>
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
        body: 'Windshield replacement is covered under the comprehensive portion of most auto policies. Depending on your deductible and your state, your out-of-pocket cost may be far less than you expect. Ask when you call — the shop can walk you through how your coverage applies before any work is done.',
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
        body: 'Many insurers cover chip repair at no cost to you — they would rather pay for a repair now than a replacement later. Ask the shop to check how your policy handles glass repair.',
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
        body: 'Like windshields, back glass falls under comprehensive coverage on most policies. The shop can help you understand what your policy covers before work begins.',
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
        body: 'Depending on the vehicle, calibration is done with targets in a controlled space (static), by driving the vehicle under specific conditions (dynamic), or both. It’s precision work with manufacturer procedures — which is why not every glass shop offers it, and why it matters that yours does.',
      },
      {
        heading: 'One appointment, not two',
        body: 'Having replacement and calibration done together means the vehicle leaves with its safety systems verified, instead of driving uncalibrated to a second appointment at a dealership.',
      },
    ],
  },
]

export function servicesForClient(flags: Record<ServiceFlag, boolean>): ServicePage[] {
  return SERVICE_PAGES.filter((s) => flags[s.flag])
}

export function getServicePage(slug: string): ServicePage | undefined {
  return SERVICE_PAGES.find((s) => s.slug === slug)
}
