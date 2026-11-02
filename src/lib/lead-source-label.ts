/**
 * THE `source` FIELD A SHOP'S CRM RECEIVES, in words a shop owner reads.
 * Import-free, so scripts/check-lead-source-label.ts runs it directly.
 *
 * Auto Glass Kings' owner looked at his HighLevel contacts and saw no source,
 * and he was right: the forwarded payload carried `traffic_source: "google"`,
 * `traffic_medium: "paid"`, the UTMs and the click ids — everything needed to
 * say where the lead came from, and nothing NAMED `source`. HighLevel fills a
 * contact's Source only from a field it is mapped to, so the obvious name had
 * to exist. This is that field: one readable value, decided the same way the
 * app decides it for its own lead list (`leadTrafficSource`), so the CRM and
 * the app never disagree about a lead.
 *
 * WHAT A CALL CAN AND CANNOT SAY. A phone call carries no click id, no UTM and
 * no landing page — only the number dialled and the number calling. So:
 *   - a call to a PLATFORM number (Microsoft, Meta) is that platform's ad: the
 *     number is only ever shown to visitors those ads sent (traffic-source.ts);
 *   - a call from somebody who already sent a form TODAY inherits that form's
 *     source — same person, same enquiry, and the form knew where they came from;
 *   - anything else is "Phone call", and never a guess. The default number is
 *     the one Google ad visitors, organic searchers, the Business Profile and
 *     returning customers all see, and calling all of them "Google Ads" would be
 *     the flattering lie a shop eventually catches.
 */

export type LeadChannel = 'form' | 'call' | 'text'

export interface SourceFacts {
  /** `Lead.trafficSource`: google | microsoft | meta | other | direct | unknown */
  trafficSource?: string | null
  /** `Lead.trafficMedium`: paid | organic | social | referral | email | other | none */
  trafficMedium?: string | null
  /** The visit's `utm_source`, when it had one — names the place the platform verdict cannot. */
  utmSource?: string | null
}

/**
 * A BUSINESS PROFILE LINK IS NAMED FOR WHAT IT IS. Shops tag the website link
 * on their Google Business Profile (AGK's reads `utm_source=gbp_irvine&
 * utm_medium=organic`), and the platform verdict for that visit is "other" —
 * a UTM from a source it does not know — so the first real forwarded lead
 * told Andrew it came from "Other website" when it came from his own Irvine
 * listing. Matched on the common spellings, any suffix (one per location).
 */
const BUSINESS_PROFILE_UTM = /^(gbp|gmb|google[-_ ]?(my[-_ ]?)?business([-_ ]?profile)?)([-_ ].*)?$/i

/** Sources a shop tags links with, in the words a shop owner uses. */
const NAMED_UTM_SOURCES: Record<string, string> = {
  yelp: 'Yelp',
  nextdoor: 'Nextdoor',
  instagram: 'Instagram',
  facebook: 'Facebook',
  fb: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  bing: 'Bing',
  newsletter: 'Email',
  email: 'Email',
}

/** A form lead's source, from what the app recorded about the visit. */
export function leadSourceLabel(facts: SourceFacts): string {
  const source = (facts.trafficSource || '').toLowerCase()
  const medium = (facts.trafficMedium || '').toLowerCase()
  const paid = medium === 'paid'
  const utm = (facts.utmSource || '').trim()
  // A Business Profile link beats the platform verdict: an ad click is never
  // tagged like this, and "Google (organic)" would hide the one fact the shop
  // can act on — which listing is sending people.
  if (utm && !paid && BUSINESS_PROFILE_UTM.test(utm)) return 'Google Business Profile'
  switch (source) {
    case 'google':
      return paid ? 'Google Ads' : 'Google (organic)'
    case 'microsoft':
      return paid ? 'Microsoft Ads' : 'Bing (organic)'
    case 'meta':
      return paid ? 'Facebook Ads' : 'Facebook'
    case 'direct':
      return 'Direct'
    case 'other': {
      // The tag the shop put on the link says more than "other" ever can.
      const named = NAMED_UTM_SOURCES[utm.toLowerCase()]
      if (named) return paid ? `${named} Ads` : named
      if (paid) return 'Other ads'
      if (medium === 'social') return 'Social media'
      if (medium === 'email') return 'Email'
      if (medium === 'referral') return 'Referral'
      // An unknown tag is still the shop's own word for where the link was —
      // pass it through rather than flatten it to "Other website".
      if (utm && /^[\w .-]{1,40}$/.test(utm)) return utm
      return 'Other website'
    }
    default:
      return 'Website'
  }
}

/**
 * A call's (or text's) source. `number` is the tracking number dialled;
 * `sameDayEarlier` is the person's earlier lead today, when there is one.
 */
export function callSourceLabel(
  number: { showTo?: string | null },
  sameDayEarlier?: SourceFacts | null
): string {
  if (number.showTo === 'microsoft') return 'Microsoft Ads'
  if (number.showTo === 'meta') return 'Facebook Ads'
  const inherited = sameDayEarlier ? leadSourceLabel(sameDayEarlier) : null
  // "Website" is the form fallback for an unrecorded visit — no information,
  // so it must not overwrite the honest "Phone call".
  if (inherited && inherited !== 'Website') return inherited
  return 'Phone call'
}
