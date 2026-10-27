import type { ContentPatch } from '@/lib/content-patch'

/**
 * AGS Affordable Glass Services — the windshield-replacement landing page,
 * October 2026. Asked for by the owner: Google Ads rates the page's landing
 * experience "below average" and it converts worst of any AGS page.
 *
 * Every `from` below was copied from the LIVE page on 2026-10-19, so the dry
 * run proves the patch still matches production before anything is written.
 * What it does, and why:
 *
 * - AGS does replacement only, no chip or windshield repair. Rock chip repair
 *   is unticked, which takes it out of the nav, the service cards, the quote
 *   form, the footer and the sitemap; the old address 308s to windshield
 *   replacement so an ad or a Google result still lands somewhere. The FAQ
 *   answers and the photo that pitched repair go too.
 * - The four imported sections came off glassbc.com — AGS's OWN previous site,
 *   not another business's — with their images still linked from it, so they
 *   would have broken the week that site goes. They also pitched chip repair,
 *   "fast turnaround" and "seven days a week". Replaced by ONE section written
 *   from facts already in AGS's content: mobile at home or work, the shop on
 *   Kingsway, the ICBC Repair Network claim, ADAS, certified technicians,
 *   OEM-quality glass, the lifetime workmanship warranty. No new claim.
 * - The name is "AGS Affordable Glass Services" everywhere. The email was a
 *   typo of the address AGS publishes on its own site. The country is CA.
 * - The years figure ("25+", "over 25 years", "decades" on the imported
 *   copy) is one number everywhere: 25 years, confirmed by the owner.
 */
export const AGS_2026_10: ContentPatch = {
  id: 'ags-2026-10',
  title: 'AGS: windshield replacement page — replacement only, Tri-Cities, BC',
  client: 'ags',

  clientFields: [
    { field: 'businessName', from: 'AGS Affordable Auto Glass Services', to: 'AGS Affordable Glass Services' },
    { field: 'email', from: 'info@glasabc.com', to: 'info@glassbc.com' },
    // The schema markup said "addressCountry": "US" for a Port Coquitlam shop:
    // `country` is a default nobody set. The province already wins for the
    // phone search and the postal-code form; the markup reads this field.
    { field: 'country', from: 'US', to: 'CA' },
    { field: 'offersRockChipRepair', from: true, to: false },
    // Already off on the live site; asserted so a re-tick since is caught.
    { field: 'offersWindshieldRepair', from: false, to: false },
  ],

  textReplace: [
    { field: 'warrantyText', from: 'government-certified technicians', to: 'certified technicians' },
    {
      field: 'footerBlurb',
      from: 'Affordable Glass Services ltd. is a Port Coquitlam auto glass shop with over 25 years of experience in windshield repair and replacement, side and back glass, and ADAS calibration, with lines open 7 days a week.',
      to: 'AGS Affordable Glass Services is a Port Coquitlam auto glass shop with 25 years of experience in windshield replacement, side and back glass, and ADAS calibration, serving the Tri-Cities with lines open 7 days a week.',
    },
  ],

  chapters: {
    remove: [
      'Your Trusted Team For Auto Glass Repair In Port Coquitlam',
      'Reliable Auto Glass and Windshield Replacement',
      'We Come To You',
      'Stop Small Chips From Turning Into Costly Cracks',
    ],
    add: [
      {
        heading: 'Mobile windshield replacement across the Tri-Cities',
        body: [
          'We replace windshields at your home or workplace anywhere in the Tri-Cities — Coquitlam, Port Coquitlam and Port Moody. If it suits you better, bring the vehicle to our shop at 2660 Kingsway Avenue in Port Coquitlam instead.',
          'We are part of the ICBC Repair Network, so we submit the glass claim to ICBC for you and deal with the paperwork. If your vehicle has a camera behind the windshield, we recalibrate it as part of the job. Every installation is done by certified technicians using OEM-quality glass, and it is backed by our lifetime workmanship warranty.',
        ].join('\n\n'),
        // AGS's own photo, already on our storage — not a glassbc.com link.
        photoUrl:
          'https://iivcotdzb4qygtfe.public.blob.vercel-storage.com/sites/ags-affordable-glass-services/imported-wm/1789832159941-V71rFiOr3XStxALew6FgWDZ9D00Hbi.jpg',
      },
    ],
  },

  faq: {
    remove: [
      'Can you repair my windshield, or do I need a full replacement?',
      'Will the chip disappear completely after repair?',
      'Is a small chip worth fixing, or can I leave it?',
      'What makes a crack too far gone to repair?',
    ],
    replaceInAnswer: [
      {
        q: 'Do I have to come to your shop, or can you come to me?',
        from: 'We offer convenient auto glass repair in Poco and surrounding areas like Coquitlam at your home or work.',
        to: 'We replace windshields at your home or work anywhere in the Tri-Cities — Coquitlam, Port Coquitlam and Port Moody.',
      },
    ],
  },

  heroBullets: {
    fromLeads: ['25+ Years of Experience', 'Certified Technicians', 'OEM-Quality Glass', 'Free Mobile Service'],
    to: [
      {
        lead: 'Free Mobile Service',
        text: 'We replace your windshield at home or work across the Tri-Cities — Coquitlam, Port Coquitlam and Port Moody.',
      },
      {
        lead: 'Certified Technicians',
        text: 'Our team is fully trained and certified, ensuring every installation meets strict safety standards.',
      },
      {
        lead: 'OEM-Quality Glass',
        text: 'We use only the highest-quality auto glass — so your vehicle retains its integrity, safety, and performance.',
      },
      {
        lead: '25 Years of Experience',
        text: 'We have built our reputation in the Tri-Cities on trust, reliability and excellence.',
      },
    ],
  },

  // The first screen on a phone: H1, this line, then the form.
  serviceHeroLines: {
    'windshield-replacement':
      'Mobile windshield replacement at your home or work across the Tri-Cities — with your ICBC claim handled, ADAS calibration included, a lifetime warranty and a free quote first.',
  },

  photos: {
    removeByAlt: ['Chip repair tool mounted on a windshield'],
    renameAlt: [
      {
        from: 'Front of the Affordable Auto Glass building with ICBC and private claims signage',
        to: 'Front of the AGS Affordable Glass Services building with ICBC and private claims signage',
      },
      {
        from: 'Affordable Auto Glass shop exterior with signage and service bay doors',
        to: 'AGS Affordable Glass Services shop exterior with signage and service bay doors',
      },
    ],
  },

  redirects: [{ from: '/rock-chip-repair', to: '/windshield-replacement' }],

  // Three city pages listed chip repair among the services. The road-damage
  // lines ("grit … is what starts most rock chips") describe the road, not a
  // service, and stayed — until the owner asked otherwise: ags-2026-10-cities.
  cityText: [
    {
      city: 'Coquitlam',
      from: 'windshield replacement, rock chip repair, side and back glass',
      to: 'windshield replacement, side and back glass',
    },
    {
      city: 'Port Coquitlam',
      from: 'windshield replacement, rock chip repair, side and back glass',
      to: 'windshield replacement, side and back glass',
    },
    {
      city: 'Port Moody',
      from: 'Chip repair, windshield, side and back glass, plus ADAS calibration.',
      to: 'Windshield, side and back glass replacement, plus ADAS calibration.',
    },
  ],

  // The schema's address comes from the primary location row, which carries
  // its own `country` (also defaulted to US).
  locationCountry: { from: 'US', to: 'CA' },
}
