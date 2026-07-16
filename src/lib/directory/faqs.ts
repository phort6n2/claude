// ============================================
// AUTO GLASS DIRECTORY — CURATED FAQ CONTENT
// ============================================
// Consumer-facing FAQ copy used for on-page content and FAQPage JSON-LD.
// Answers are intentionally general and truthful: no fabricated statistics
// and no legal or coverage guarantees. Anything insurance-related notes that
// specifics vary by state and policy.

export interface Faq {
  q: string
  a: string
}

/** Evergreen auto glass questions, safe to show on any page. */
export const GENERAL_AUTO_GLASS_FAQS: Faq[] = [
  {
    q: 'Does insurance cover windshield repair or replacement?',
    a: 'Most comprehensive auto policies cover glass damage, and many waive the deductible for a small chip repair. Whether replacement is covered, and how much you pay out of pocket, depends on your deductible and where you live — a few states require insurers to cover glass with no deductible. Check your specific policy or ask the shop to verify your coverage before work begins.',
  },
  {
    q: 'Should I repair or replace my windshield?',
    a: 'A chip or crack smaller than a dollar bill that is not in the driver\'s direct line of sight and has not reached the edge of the glass can usually be repaired with resin. Larger cracks, damage at the edge, or anything blocking the driver\'s view typically calls for a full replacement.',
  },
  {
    q: 'What is ADAS calibration and do I need it after a windshield replacement?',
    a: 'Many newer vehicles have a forward-facing camera mounted to the windshield that powers driver-assistance features like lane-keeping and automatic emergency braking. When that windshield is replaced, the camera generally must be recalibrated so those systems aim correctly. Ask whether your vehicle needs calibration and whether the shop performs it in-house.',
  },
  {
    q: 'Can auto glass shops come to me with mobile service?',
    a: 'Yes — many shops offer mobile service and will replace or repair your glass at your home or workplace. Some ADAS calibrations require specialized in-shop equipment, so a mobile technician may still ask you to visit the shop for that step.',
  },
  {
    q: 'How long does a windshield replacement take?',
    a: 'The glass work itself is often done in about an hour, but the adhesive needs additional time to cure before the vehicle is safe to drive, and any required ADAS calibration adds time. Plan for the shop to have your vehicle for a few hours.',
  },
  {
    q: 'How long before I can drive after a windshield replacement?',
    a: 'The adhesive bonding the glass needs time to set — this is called the safe drive-away time. It varies by the adhesive and the weather, so follow the exact time your installer gives you rather than a general rule before driving.',
  },
  {
    q: 'Does a small chip really need to be fixed?',
    a: 'It is worth addressing promptly. Temperature swings, road vibration, and moisture can cause a small chip to spread into a long crack, and once it does the glass usually needs full replacement instead of a quick, inexpensive repair.',
  },
  {
    q: 'What is the difference between OEM and aftermarket auto glass?',
    a: 'OEM (or OEE) glass is made to the vehicle manufacturer\'s specifications, while aftermarket glass is produced by other manufacturers and is often less expensive. Quality aftermarket glass can be a fine choice; if you want an exact match — for example on a vehicle with a camera or heads-up display — ask the shop which they will use.',
  },
]

/**
 * Localized FAQ variants that weave in the city name naturally. Kept truthful
 * and general — the only thing that changes is the location framing.
 */
export function cityFaqs(city: string, state: string): Faq[] {
  const region = `${city}, ${state.toUpperCase()}`
  return [
    {
      q: `How much does windshield replacement cost in ${city}?`,
      a: `Pricing in ${city} depends on your vehicle, the type of glass, and whether the windshield camera needs ADAS calibration — vehicles with driver-assistance features cost more to complete. Most shops give a free quote by phone once they have your year, make, and model, and many bill your insurance directly.`,
    },
    {
      q: `Do auto glass shops in ${city} work with my insurance?`,
      a: `Many shops in ${region} handle insurance claims directly and can tell you whether your policy covers the work. Coverage and deductibles vary by policy and by state, so confirm the details with the shop or your insurer before the job starts.`,
    },
    {
      q: `Is mobile windshield service available in ${city}?`,
      a: `Yes — several shops serving ${city} will come to your home or workplace to repair or replace your glass. If your vehicle needs ADAS calibration, the technician may ask you to visit the shop for that step, since it can require in-shop equipment.`,
    },
    {
      q: `Can I get same-day auto glass repair in ${city}?`,
      a: `Many ${city} shops stock common windshields and can handle chip repairs or replacements the same day, especially if you call ahead. Availability depends on your specific glass and whether calibration is required, so it is best to confirm when you book.`,
    },
    {
      q: `How do I choose a good auto glass shop in ${city}?`,
      a: `Look for a shop near ${city} that works with your insurance, offers the service you need — such as mobile service or ADAS calibration — and has solid local reviews. Comparing a couple of quotes and asking what type of glass they install helps you make a confident choice.`,
    },
  ]
}
