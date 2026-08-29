/**
 * What a new shop is asked, and what happens to the answers.
 *
 * ONE definition, read by three things: the public form renders it, the
 * review page labels the answers with it, and `clientFromAnswers` below maps
 * it onto the record. A second copy of the field list is how a question gets
 * asked and then quietly dropped on the way in.
 *
 * WHAT IS DELIBERATELY NOT ASKED. Nothing whose answer the site would state
 * as fact without a place to qualify it — years in business, certifications,
 * response times, "we pay your deductible". §2 of CLAUDE.md is not a UI rule;
 * a field that exists is a field somebody fills in, and a claim collected is
 * a claim that ends up on a page. The two claims that ARE collected —
 * insurance billing and whether the number takes texts — exist because the
 * template already gates real behaviour on them.
 */

export type FieldKind = 'text' | 'email' | 'tel' | 'textarea' | 'list' | 'boolean' | 'select'

export interface IntakeField {
  key: string
  label: string
  kind: FieldKind
  /** Shown under the label. Say why it is asked, not what to type. */
  help?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
  placeholder?: string
}

export interface IntakeSection {
  key: string
  title: string
  blurb: string
  fields: IntakeField[]
  /** Only asked of done-for-you SEO clients. */
  seoOnly?: boolean
}

export const US_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    key: 'business',
    title: 'Your business',
    blurb: 'The details that appear on your site and on Google.',
    fields: [
      { key: 'businessName', label: 'Business name', kind: 'text', required: true },
      { key: 'contactPerson', label: 'Who we talk to', kind: 'text' },
      {
        key: 'phone',
        label: 'Main phone number',
        kind: 'tel',
        required: true,
        help: 'The line you want customers to reach. We can add a tracking number later without changing this.',
      },
      { key: 'email', label: 'Business email', kind: 'email', required: true },
      { key: 'streetAddress', label: 'Street address', kind: 'text', required: true },
      { key: 'city', label: 'City', kind: 'text', required: true },
      { key: 'state', label: 'State', kind: 'text', required: true, placeholder: 'CO' },
      { key: 'postalCode', label: 'ZIP', kind: 'text', required: true },
      {
        key: 'timezone',
        label: 'Your timezone',
        kind: 'select',
        options: US_TIMEZONES.map((tz) => ({ value: tz, label: tz.replace('America/', '').replace(/_/g, ' ') })),
        help: 'Lead alerts show the time a customer called, in your time — not ours.',
      },
      {
        key: 'websiteUrl',
        label: 'Your current website',
        kind: 'text',
        help: 'If you have one. We read it to draft your new pages, so you are not re-typing what you already wrote.',
        placeholder: 'https://',
      },
      {
        key: 'googleMapsUrl',
        label: 'Your Google Business Profile',
        kind: 'text',
        help: 'Paste the link to your listing on Google Maps. It is where your rating and reviews come from.',
      },
    ],
  },
  {
    key: 'services',
    title: 'What you do',
    blurb: 'Only tick what you actually offer — every one of these becomes a page.',
    fields: [
      { key: 'offersWindshieldReplacement', label: 'Windshield replacement', kind: 'boolean' },
      { key: 'offersWindshieldRepair', label: 'Windshield repair', kind: 'boolean' },
      { key: 'offersRockChipRepair', label: 'Rock chip repair', kind: 'boolean' },
      { key: 'offersSideWindowRepair', label: 'Side window replacement', kind: 'boolean' },
      { key: 'offersBackWindowRepair', label: 'Back glass replacement', kind: 'boolean' },
      { key: 'offersSunroofRepair', label: 'Sunroof glass', kind: 'boolean' },
      { key: 'offersAdasCalibration', label: 'ADAS calibration', kind: 'boolean' },
      {
        key: 'hasShopLocation',
        label: 'Customers can come to a shop',
        kind: 'boolean',
        help: 'Off if you are mobile only — the site then never sends anyone to an address.',
      },
      { key: 'offersMobileService', label: 'You travel to the customer', kind: 'boolean' },
      {
        key: 'serviceAreas',
        label: 'Towns you cover',
        kind: 'list',
        help: 'The first five get their own page. List the ones you actually work in — being nearby is not the same as serving it.',
      },
    ],
  },
  {
    key: 'handling',
    title: 'How you handle a job',
    blurb: 'These two change what the site is allowed to say on your behalf.',
    fields: [
      {
        key: 'filesInsuranceClaims',
        label: 'You deal with the insurance company directly',
        kind: 'boolean',
        help: 'On: the site says you handle the claim. Off: it says you will check the coverage and give the carrier what it needs. We will not claim the first unless you tell us it is true.',
      },
      {
        key: 'smsCapable',
        label: 'Your number can receive text messages',
        kind: 'boolean',
        help: 'Off means the site never offers "text us a photo" — a text to a landline is a lead that vanishes.',
      },
      {
        key: 'hours',
        label: 'Opening hours',
        kind: 'textarea',
        placeholder: 'Mon–Fri 8:00 AM – 5:00 PM, Sat 9:00 AM – 2:00 PM',
      },
      {
        key: 'warrantyTitle',
        label: 'Warranty name',
        kind: 'text',
        placeholder: 'Lifetime Workmanship Warranty',
        help: 'Only if you offer one.',
      },
      {
        key: 'warrantyText',
        label: 'What the warranty actually covers',
        kind: 'textarea',
        help: 'Required if you named one above. A warranty named without its terms is the one thing we will not publish.',
      },
      {
        key: 'about',
        label: 'Anything you want customers to know about the shop',
        kind: 'textarea',
        help: 'In your words. We will tidy the writing, never the facts.',
      },
    ],
  },
  {
    key: 'alerts',
    title: 'Where your leads go',
    blurb: 'The moment someone asks for a quote, this is who hears about it.',
    fields: [
      {
        key: 'notifyEmails',
        label: 'Email addresses for lead alerts',
        kind: 'list',
        help: 'Whoever picks up the phone, not whoever owns the company — unless they are the same person.',
      },
      {
        key: 'notifyPhones',
        label: 'Mobile numbers for text alerts',
        kind: 'list',
        help: 'Optional add-on. Leave blank if you only want email.',
      },
      {
        key: 'emailCallLeads',
        label: 'Email me about phone calls too',
        kind: 'boolean',
        help: 'Off if your phone is always answered and an email about a call you just took is noise.',
      },
    ],
  },
  {
    key: 'seo',
    title: 'Search visibility',
    blurb: 'For the done-for-you plan, so the rank tracking and the content are pointed at the right things.',
    seoOnly: true,
    fields: [
      {
        key: 'rankKeywords',
        label: 'The searches you want to win',
        kind: 'list',
        help: 'Plain terms, no city — the rank map already measures from points around you.',
      },
      {
        key: 'competitors',
        label: 'Shops you lose work to',
        kind: 'list',
        help: 'Names or websites. It tells us who we are actually up against on the map.',
      },
      {
        key: 'contentTopics',
        label: 'Anything you want written about',
        kind: 'list',
        help: 'Jobs you want more of, questions customers keep asking.',
      },
    ],
  },
]

export function sectionsFor(seo: boolean): IntakeSection[] {
  return INTAKE_SECTIONS.filter((section) => !section.seoOnly || seo)
}

export type IntakeAnswers = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const bool = (v: unknown): boolean => v === true
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((entry) => String(entry).trim()).filter(Boolean) : []

/** Everything still missing before this could become a client. */
export function missingRequired(answers: IntakeAnswers, seo: boolean): string[] {
  const missing: string[] = []
  for (const section of sectionsFor(seo)) {
    for (const field of section.fields) {
      if (field.required && !str(answers[field.key])) missing.push(field.label)
    }
  }
  // Not a "required" flag, because it is only required conditionally — and it
  // is the compliance rule that matters most on this form.
  if (str(answers.warrantyTitle) && !str(answers.warrantyText)) {
    missing.push('What the warranty actually covers')
  }
  return missing
}

/**
 * The answers, shaped for `prisma.client.create`.
 *
 * Booleans that were never touched default the way the schema does rather
 * than to false — an untouched form should produce the same client the admin
 * would have created by hand.
 */
export function clientFromAnswers(answers: IntakeAnswers) {
  return {
    businessName: str(answers.businessName),
    contactPerson: str(answers.contactPerson) || null,
    phone: str(answers.phone),
    email: str(answers.email),
    streetAddress: str(answers.streetAddress),
    city: str(answers.city),
    state: str(answers.state).toUpperCase().slice(0, 2),
    postalCode: str(answers.postalCode),
    timezone: str(answers.timezone) || 'America/Denver',
    websiteUrl: str(answers.websiteUrl) || null,
    googleMapsUrl: str(answers.googleMapsUrl) || null,
    serviceAreas: list(answers.serviceAreas),
    hasShopLocation: answers.hasShopLocation === undefined ? true : bool(answers.hasShopLocation),
    offersMobileService: bool(answers.offersMobileService),
    offersWindshieldRepair: bool(answers.offersWindshieldRepair),
    offersWindshieldReplacement: bool(answers.offersWindshieldReplacement),
    offersSideWindowRepair: bool(answers.offersSideWindowRepair),
    offersBackWindowRepair: bool(answers.offersBackWindowRepair),
    offersSunroofRepair: bool(answers.offersSunroofRepair),
    offersRockChipRepair: bool(answers.offersRockChipRepair),
    offersAdasCalibration: bool(answers.offersAdasCalibration),
    filesInsuranceClaims: bool(answers.filesInsuranceClaims),
    smsCapable: bool(answers.smsCapable),
  }
}

export function notificationFromAnswers(answers: IntakeAnswers) {
  const emailTo = list(answers.notifyEmails)
  const smsTo = list(answers.notifyPhones)
  return {
    emailTo,
    // Enabled only when there is somewhere to send it — the same rule the
    // admin card enforces, so an approved intake cannot produce a client whose
    // alerts are "on" with no recipients.
    emailEnabled: emailTo.length > 0,
    emailCallLeads: answers.emailCallLeads === undefined ? true : bool(answers.emailCallLeads),
    // SMS is the paid add-on and stays OFF until someone decides to bill it.
    // The numbers are kept so that decision is one click, not another email.
    smsTo,
    smsEnabled: false,
  }
}

export function siteContentFromAnswers(answers: IntakeAnswers) {
  const warrantyTitle = str(answers.warrantyTitle)
  const warrantyText = str(answers.warrantyText)
  return warrantyTitle && warrantyText ? { warrantyTitle, warrantyText } : null
}
