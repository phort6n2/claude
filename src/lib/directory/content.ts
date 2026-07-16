// ============================================
// AUTO GLASS DIRECTORY — CENTRALIZED MARKETING COPY
// ============================================
// Single source of truth for the words on the public directory. Pages should
// import from here instead of hardcoding strings, so tone stays consistent and
// copy can be tuned without touching layout/JSX. Two audiences share this file:
//   1. Local drivers searching for windshield help.
//   2. Shop owners we want to claim a free listing (and later upsell SEO/ads).
// Keep everything honest and specific to auto glass — no invented awards or
// stats. US spelling throughout.

export interface HeroCopy {
  title: string
  subtitle: string
}

export interface ForShopsCopy {
  eyebrow: string
  title: string
  subtitle: string
  /** Ordered "how it works" steps for the SEO/ads landing. */
  steps: string[]
  /** Paid offerings we upsell to claimed shops. */
  services: { title: string; desc: string }[]
}

export interface ClaimCopy {
  title: string
  subtitle: string
  benefits: string[]
  upsellTitle: string
  upsellBody: string
}

export interface OwnerCtaCopy {
  title: string
  body: string
  primary: string
  secondary: string
}

export interface CityAdviceCopy {
  title: string
  paragraphs: string[]
}

// --------------------------------------------
// Directory home
// --------------------------------------------
export const HERO: HeroCopy = {
  title: 'Find a trusted auto glass shop near you',
  subtitle:
    'Compare local windshield repair, replacement, and ADAS calibration specialists — see services, insurers accepted, and whether they come to you, all in one place.',
}

// --------------------------------------------
// "For shops" SEO/ads upsell landing
// --------------------------------------------
export const FOR_SHOPS: ForShopsCopy = {
  eyebrow: 'For auto glass shops',
  title: 'Get found by drivers the moment their windshield cracks',
  subtitle:
    'Claim your free listing to show up in local search, then let us drive booked jobs with done-for-you SEO and ads built specifically for auto glass.',
  steps: [
    'Claim your free listing and confirm your services, hours, and the insurers you bill.',
    'Show up when nearby drivers search for windshield repair, replacement, or calibration.',
    'Turn on managed SEO and ads to fill your schedule, and track the calls and quotes they generate.',
  ],
  services: [
    {
      title: 'Local SEO',
      desc: 'We optimize your listing and location pages so you rank for "windshield replacement near me" and the searches that actually book work.',
    },
    {
      title: 'Search & Maps ads',
      desc: 'Targeted campaigns that put your shop in front of drivers with a chipped or cracked windshield right now — you set the budget, we manage the rest.',
    },
    {
      title: 'Reviews & reputation',
      desc: 'Turn happy customers into a steady stream of reviews that build trust and lift your ranking against nearby competitors.',
    },
    {
      title: 'Call & lead tracking',
      desc: 'See which calls, quote requests, and jobs came from your listing and campaigns, so you know exactly what your marketing returns.',
    },
  ],
}

// --------------------------------------------
// Claim-your-listing flow
// --------------------------------------------
export const CLAIM: ClaimCopy = {
  title: 'Claim your shop — free',
  subtitle:
    'Take control of how your auto glass business appears to local drivers. Verifying is free and takes just a few minutes.',
  benefits: [
    'Edit your services, hours, service area, and the insurers you accept',
    'Add your phone, website, and mobile-service coverage so drivers can book',
    'Show a verified badge that signals an active, trustworthy shop',
    'Stand out above unclaimed listings in your city',
  ],
  upsellTitle: 'Ready for more jobs?',
  upsellBody:
    'A claimed listing gets you found. When you want a fuller schedule, our managed SEO and ad campaigns are built just for auto glass shops — no long-term contract, and you can see the calls and quotes they bring in.',
}

// --------------------------------------------
// "Own a shop?" band (site-wide CTA)
// --------------------------------------------
export const OWNER_CTA: OwnerCtaCopy = {
  title: 'Own an auto glass shop?',
  body: 'Claim your free listing to reach local drivers searching for windshield help, and add managed SEO and ads whenever you want more booked jobs.',
  primary: 'Claim your free listing',
  secondary: 'See how it works',
}

// --------------------------------------------
// City-page helpers
// --------------------------------------------

/**
 * Short local intro for a city directory page.
 * @param city   Display city name, e.g. "Austin".
 * @param state  Full state name for display, e.g. "Texas".
 * @param count  Total shops listed in this city.
 * @param mobileCount  How many of those offer mobile service.
 */
export function cityIntro(
  city: string,
  state: string,
  count: number,
  mobileCount: number,
): string {
  const shopWord = count === 1 ? 'shop' : 'shops'
  const listPart =
    count === 1
      ? `We list 1 auto glass ${shopWord} in ${city}, ${state}`
      : `We list ${count} auto glass ${shopWord} in ${city}, ${state}`

  let mobilePart: string
  if (mobileCount === 0) {
    mobilePart =
      'Compare their services, the insurers they bill, and hours to book windshield repair, replacement, or calibration with confidence.'
  } else if (mobileCount === count) {
    mobilePart =
      'Every one offers mobile service, so you can compare specialties, accepted insurance, and hours, then have a technician come to you.'
  } else {
    mobilePart = `${mobileCount} offer mobile service that comes to your home or work. Compare their specialties, accepted insurance, and hours to find the right fit.`
  }

  return `${listPart}. ${mobilePart}`
}

/**
 * Educational "choosing a shop in {city}" block. Two short, accurate paragraphs
 * covering repair-vs-replace and why ADAS calibration matters.
 */
export function cityAdvice(city: string): CityAdviceCopy {
  return {
    title: `Choosing an auto glass shop in ${city}`,
    paragraphs: [
      'Start with repair versus replacement. A chip smaller than a quarter, or a crack shorter than a few inches and out of the driver’s direct line of sight, can usually be repaired the same day for far less than a new windshield, and comprehensive insurance often covers it at little or no cost. Once damage spreads into a long crack, reaches the edge of the glass, or sits directly in front of the driver, replacement is the safer call. A reputable shop will tell you honestly which one you need.',
      `If your vehicle has a camera mounted near the rearview mirror for lane-keeping, automatic braking, or adaptive cruise, that camera looks through the windshield and must be recalibrated after any replacement. Skipping this step can leave those safety systems misaligned. When comparing ${city} shops, confirm they perform ADAS calibration in-house or coordinate it, and ask for documentation that it was completed.`,
    ],
  }
}
