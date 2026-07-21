// ============================================
// DIRECTORY — SEED BLOG POSTS
// ============================================
// Hand-written starter articles so /blog is useful from day one, before the
// BabyLoveGrowth autoblog ramps up. These render exactly like API-sourced
// posts (same Article shape) and are merged with the live feed in blog.ts.
// Hero images are self-hosted CC0/public-domain photos under /public/blog.

import type { Article } from '@/lib/directory/blog'

const SITE = 'Windshield Repair HQ'

interface Seed {
  slug: string
  title: string
  image: string
  date: string // ISO
  meta: string
  excerpt: string
  html: string
  faqs?: { q: string; a: string }[]
}

function articleJsonLd(s: Seed) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: s.title,
    description: s.meta,
    image: `https://windshieldrepairhq.com${s.image}`,
    datePublished: s.date,
    dateModified: s.date,
    author: { '@type': 'Organization', name: SITE },
    publisher: {
      '@type': 'Organization',
      name: SITE,
      logo: {
        '@type': 'ImageObject',
        url: 'https://windshieldrepairhq.com/logo.png',
      },
    },
  }
}

function faqJsonLd(s: Seed) {
  if (!s.faqs?.length) return undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: s.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

const SEEDS: Seed[] = [
  {
    slug: 'windshield-repair-vs-replacement',
    title: 'Windshield Repair vs. Replacement: Which One Do You Need?',
    image: '/blog/repair-vs-replacement.jpg',
    date: '2026-07-18T14:00:00.000Z',
    meta: 'A chip or crack in your windshield? Learn when a quick repair works and when you need a full replacement — plus how size, location, and depth decide it.',
    excerpt:
      'Not every chip means a new windshield. Here is how pros decide between a quick resin repair and a full replacement.',
    html: `
      <p>A rock kicks up on the highway, cracks your windshield, and now you are staring at a decision: can this be repaired, or do you need a whole new windshield? The right answer depends on three things — the <strong>size</strong>, <strong>location</strong>, and <strong>depth</strong> of the damage.</p>
      <h2>When a repair is enough</h2>
      <p>Modern resin repairs are fast, affordable, and often covered in full by insurance. A technician can usually repair damage when:</p>
      <ul>
        <li>The chip is smaller than a quarter, or the crack is shorter than about three inches.</li>
        <li>It is not directly in the driver's line of sight.</li>
        <li>The damage has not reached the inner layer of the glass.</li>
        <li>There is only one crack, not a web of them.</li>
      </ul>
      <p>Repairs restore most of the glass's strength and stop the damage from spreading. Most take under 30 minutes.</p>
      <h2>When you need a replacement</h2>
      <p>Some damage is past the point of a safe repair. Plan on a full replacement when:</p>
      <ul>
        <li>The crack is longer than a dollar bill or spreads to the edge of the glass.</li>
        <li>The damage sits right in front of the driver, where a repair could leave distortion.</li>
        <li>There are multiple cracks or the inner layer is compromised.</li>
        <li>The chip has collected dirt and moisture over weeks or months.</li>
      </ul>
      <h2>Why it matters for safety</h2>
      <p>Your windshield is a structural part of the car. It supports the roof in a rollover and provides the backstop your passenger airbag needs to deploy correctly. A compromised windshield is not just a cosmetic problem — it affects how the whole vehicle protects you.</p>
      <h2>The bottom line</h2>
      <p>When in doubt, act fast. A chip you fix this week is a cheap repair; the same chip left to spread across the glass becomes a replacement. Have a shop take a look before a small problem grows.</p>
    `,
    faqs: [
      {
        q: 'How long does a windshield repair take?',
        a: 'Most chip and small-crack repairs take 20 to 30 minutes and can often be done while you wait or via a mobile technician at your home or office.',
      },
      {
        q: 'Will a repair make the crack disappear completely?',
        a: 'A repair stops the damage from spreading and restores strength, but a faint mark may remain. A replacement is the only way to make the glass look brand new.',
      },
    ],
  },
  {
    slug: 'windshield-replacement-cost',
    title: 'How Much Does Windshield Replacement Cost in 2026?',
    image: '/blog/cost.jpg',
    date: '2026-07-14T14:00:00.000Z',
    meta: 'Windshield replacement typically runs $250–$1,000+ depending on your vehicle, glass type, and sensors. Here is what drives the price and how to save.',
    excerpt:
      'From economy sedans to sensor-packed SUVs, here is what a new windshield really costs in 2026 — and what pushes the price up.',
    html: `
      <p>Windshield replacement usually costs somewhere between <strong>$250 and $1,000+</strong>. That is a wide range, and the reason is simple: not all windshields — or vehicles — are created equal. Here is what actually drives the number.</p>
      <h2>What affects the price</h2>
      <h3>Your vehicle</h3>
      <p>A common sedan is cheap to glass. A late-model SUV, luxury car, or truck with a large, curved windshield costs more in both glass and labor.</p>
      <h3>Sensors and cameras (ADAS)</h3>
      <p>If your car has lane-keeping, automatic emergency braking, or a camera mounted at the top of the windshield, that glass has to be recalibrated after replacement. Calibration alone can add <strong>$150–$400</strong>.</p>
      <h3>Glass type</h3>
      <p>OEM (original manufacturer) glass costs more than aftermarket (OEE) glass. Features like rain sensors, heated glass, acoustic layers, or a HUD (heads-up display) all raise the price.</p>
      <h2>Typical ranges</h2>
      <ul>
        <li><strong>Older/economy vehicle, no sensors:</strong> $250–$400</li>
        <li><strong>Modern vehicle with a camera + calibration:</strong> $500–$900</li>
        <li><strong>Luxury, HUD, or heated glass:</strong> $900–$1,500+</li>
      </ul>
      <h2>How to save without cutting corners</h2>
      <ul>
        <li><strong>Check your insurance.</strong> Many comprehensive policies cover glass, and some states require a $0 deductible for repairs.</li>
        <li><strong>Repair early.</strong> A $60–$120 chip repair is far cheaper than a replacement.</li>
        <li><strong>Get more than one quote.</strong> Prices for the exact same glass vary shop to shop.</li>
        <li><strong>Ask about mobile service.</strong> Many shops come to you at no extra charge.</li>
      </ul>
      <p>The cheapest quote is not always the best value — make sure calibration is included when your car needs it, and that the shop uses quality glass and a proper cure time.</p>
    `,
    faqs: [
      {
        q: 'Does insurance cover windshield replacement?',
        a: 'If you carry comprehensive coverage, glass damage is usually covered minus your deductible. Some states mandate no-deductible glass claims. Check your policy or ask your shop to verify your benefits.',
      },
      {
        q: 'Why is calibration so expensive?',
        a: 'Cameras and sensors behind the windshield have to be aimed precisely after the glass is replaced. It requires specialized targets or a road-test procedure and manufacturer software, which adds time and equipment cost.',
      },
    ],
  },
  {
    slug: 'adas-calibration-windshield',
    title: 'ADAS Calibration: Why Your New Windshield Needs It',
    image: '/blog/adas-calibration.jpg',
    date: '2026-07-08T14:00:00.000Z',
    meta: 'If your car has lane-keeping or automatic braking, a new windshield must be recalibrated. Here is what ADAS calibration is and why skipping it is dangerous.',
    excerpt:
      'That camera at the top of your windshield runs your safety systems. Replace the glass and it has to be recalibrated — here is why.',
    html: `
      <p>If your vehicle was built in the last several years, there is a good chance a small camera lives at the top of your windshield, right behind the mirror. It powers your <strong>Advanced Driver Assistance Systems (ADAS)</strong> — lane-keeping, automatic emergency braking, adaptive cruise control, and more. When the windshield is replaced, that camera almost always needs to be recalibrated.</p>
      <h2>What is ADAS calibration?</h2>
      <p>Calibration re-aims and re-teaches the camera (and sometimes radar) so it reads the road correctly. Even a millimeter of difference in how the new glass or camera sits can throw the system's aim off by feet at a distance — enough to make it brake late or drift out of a lane.</p>
      <h2>The two types</h2>
      <ul>
        <li><strong>Static calibration</strong> happens in the shop using printed targets set at precise distances in a controlled space.</li>
        <li><strong>Dynamic calibration</strong> is done by driving the car at set speeds on well-marked roads while software recalibrates the system.</li>
      </ul>
      <p>Some vehicles need one, some need both. A qualified shop will know what yours requires.</p>
      <h2>Why you can't skip it</h2>
      <p>An uncalibrated system does not just stop working — it can work <em>wrong</em>. It might brake when it shouldn't, fail to brake when it should, or steer against you. That is worse than having no system at all, because you are trusting features that are quietly misaligned.</p>
      <h2>What to ask your shop</h2>
      <ul>
        <li>Does my vehicle require calibration after this replacement?</li>
        <li>Is calibration included in the quote, or billed separately?</li>
        <li>Do you calibrate in-house or partner with a calibration center?</li>
        <li>Will I get documentation confirming the calibration passed?</li>
      </ul>
      <p>Any reputable auto glass shop will handle calibration as a normal part of the job. If a quote seems unusually low, confirm that calibration is included.</p>
    `,
    faqs: [
      {
        q: 'Do all cars need ADAS calibration after a windshield replacement?',
        a: 'Only vehicles equipped with a windshield-mounted camera or driver-assistance features need it — generally cars from the mid-2010s onward. Your shop can confirm based on your make, model, and year.',
      },
    ],
  },
  {
    slug: 'does-insurance-cover-windshield-replacement',
    title: 'Does Insurance Cover Windshield Replacement?',
    image: '/blog/insurance.jpg',
    date: '2026-07-01T14:00:00.000Z',
    meta: 'Comprehensive coverage usually pays for windshield damage minus your deductible, and some states require $0-deductible glass. Here is how to file a claim.',
    excerpt:
      'Comprehensive coverage usually pays for glass — and in some states, chip repairs are free. Here is how it works and how to file.',
    html: `
      <p>Good news: in most cases, <strong>yes</strong>. If you carry <strong>comprehensive coverage</strong>, windshield and glass damage is typically covered — you just pay your deductible, and the insurer covers the rest. Some states go further and require insurers to waive the deductible entirely for glass.</p>
      <h2>How coverage usually works</h2>
      <ul>
        <li><strong>Comprehensive coverage</strong> handles glass damage from rocks, storms, vandalism, and accidents that are not collisions.</li>
        <li><strong>Your deductible</strong> is what you pay out of pocket first. If a replacement costs $500 and your deductible is $250, you pay $250 and insurance covers the rest.</li>
        <li><strong>Repairs are often free.</strong> Many insurers waive the deductible on chip repairs entirely, because a cheap repair saves them a costly replacement later.</li>
      </ul>
      <h2>Free glass states</h2>
      <p>A handful of states — including <strong>Florida, Kentucky, and South Carolina</strong> — require insurers to cover windshield replacement with <strong>no deductible</strong> if you have comprehensive coverage. If you live in one of these, a new windshield may cost you nothing.</p>
      <h2>Will a glass claim raise my rates?</h2>
      <p>Usually not. Comprehensive glass claims are "no-fault" — you did not cause a rock to hit your windshield — so they rarely affect your premium the way an at-fault collision would. Still, it is worth confirming with your agent.</p>
      <h2>How to file</h2>
      <ol>
        <li>Check your policy for comprehensive coverage and your glass deductible.</li>
        <li>Pick a shop — most will verify your benefits and handle the paperwork for you.</li>
        <li>Provide your insurance and claim details; the shop bills the insurer directly.</li>
        <li>Pay only your deductible, if any.</li>
      </ol>
      <p>A good auto glass shop deals with insurers every day and can tell you in minutes what your policy covers.</p>
    `,
    faqs: [
      {
        q: 'Will filing a windshield claim increase my premium?',
        a: 'Comprehensive glass claims are typically no-fault and rarely raise your rates, unlike at-fault collision claims. Confirm with your insurer to be sure.',
      },
      {
        q: 'Can I choose my own auto glass shop?',
        a: 'Yes. You are free to choose any shop you trust — an insurer can recommend one, but cannot require you to use it.',
      },
    ],
  },
  {
    slug: 'can-a-cracked-windshield-be-repaired',
    title: 'Can a Cracked Windshield Be Repaired? A Chip & Crack Guide',
    image: '/blog/chip-crack.jpg',
    date: '2026-06-24T14:00:00.000Z',
    meta: 'Small chips and short cracks can usually be repaired if you act fast. Learn which damage is fixable, why timing matters, and how to protect a chip until then.',
    excerpt:
      'Many chips and short cracks are fixable — if you act before they spread. Here is what can be repaired and how to buy yourself time.',
    html: `
      <p>A cracked windshield is not automatically a new windshield. Plenty of chips and cracks can be repaired quickly and cheaply — but the window to do it is short. The longer you wait, the more likely a repairable chip becomes an unrepairable crack.</p>
      <h2>What can usually be repaired</h2>
      <ul>
        <li><strong>Chips</strong> smaller than a quarter.</li>
        <li><strong>Cracks</strong> up to about three inches long.</li>
        <li><strong>Bullseyes and star breaks</strong> that have not spread.</li>
        <li>Damage that is <strong>not</strong> directly in the driver's line of sight.</li>
      </ul>
      <h2>What usually can't</h2>
      <ul>
        <li>Cracks longer than a few inches or reaching the edge of the glass.</li>
        <li>Damage that has penetrated both layers of the glass.</li>
        <li>Chips that have sat for weeks collecting dirt and moisture.</li>
        <li>Multiple cracks branching from one point.</li>
      </ul>
      <h2>Why timing is everything</h2>
      <p>Glass expands and contracts with temperature. A blast of cold air on a hot windshield, a slammed door, or a bumpy road can turn a tiny, fixable chip into a foot-long crack in an instant. That is why the same damage that costs $80 to repair today can cost $500 to replace next month.</p>
      <h2>Protect a chip until you get it fixed</h2>
      <ul>
        <li>Cover it with a small piece of clear tape to keep dirt and water out.</li>
        <li>Avoid extreme temperature swings — skip the blasting defroster or car wash.</li>
        <li>Drive gently over bumps and don't slam the doors.</li>
        <li>Book a repair as soon as you can — many shops offer same-day mobile service.</li>
      </ul>
      <p>The safest move is simple: get any chip looked at quickly. A fast repair keeps your glass strong and saves you from a much bigger bill.</p>
    `,
    faqs: [
      {
        q: 'How big of a crack can be repaired?',
        a: 'As a rule of thumb, cracks up to about three inches and chips smaller than a quarter can usually be repaired, provided they are not in the driver’s direct line of sight and have not reached the edge of the glass.',
      },
    ],
  },
  {
    slug: 'mobile-windshield-replacement',
    title: 'Mobile Windshield Replacement: How It Works',
    image: '/blog/mobile-service.jpg',
    date: '2026-06-10T14:00:00.000Z',
    meta: 'Mobile windshield service brings the shop to your driveway or office. Learn how it works, what to prepare, and why safe drive-away time matters.',
    excerpt:
      'A technician comes to your home or office and replaces the glass on-site. Here is how mobile service works and what to expect.',
    html: `
      <p>Getting a windshield replaced no longer means a trip to the shop and an afternoon in a waiting room. With <strong>mobile windshield service</strong>, a technician comes to your driveway, office parking lot, or wherever your car is, and does the job on-site. Here is how it works.</p>
      <h2>The process</h2>
      <ol>
        <li><strong>Book and confirm your glass.</strong> The shop verifies the exact windshield for your make, model, and features (sensors, rain sensor, heating).</li>
        <li><strong>A technician comes to you</strong> with the glass, tools, and adhesive.</li>
        <li><strong>The old glass comes out</strong> and the frame is cleaned and prepped.</li>
        <li><strong>The new windshield is set</strong> with automotive-grade urethane adhesive.</li>
        <li><strong>Calibration, if needed,</strong> is completed on-site or scheduled at a nearby center.</li>
      </ol>
      <h2>What to prepare</h2>
      <ul>
        <li>Park somewhere reasonably level and out of heavy rain if possible.</li>
        <li>Clear personal items from the dashboard.</li>
        <li>Have your insurance or claim details ready if you are filing.</li>
        <li>Plan for the car to sit for the adhesive to cure before you drive.</li>
      </ul>
      <h2>Safe drive-away time</h2>
      <p>The single most important thing to respect is <strong>safe drive-away time</strong> — the period the adhesive needs to cure enough to hold the glass in a crash. It is usually about <strong>one hour</strong>, but depends on the adhesive and the weather. A good technician will tell you exactly when your car is safe to drive. Do not rush it.</p>
      <h2>Is mobile service as good as in-shop?</h2>
      <p>Yes — when done by a qualified technician with the right glass and adhesive, a mobile replacement is every bit as safe as an in-shop job. Many shops offer it at no extra charge. It is simply the more convenient way to get the same result.</p>
    `,
    faqs: [
      {
        q: 'How long before I can drive after a mobile windshield replacement?',
        a: 'Most modern adhesives reach safe drive-away time in about an hour, though it varies with the product and weather. Your technician will tell you the exact time for your job.',
      },
      {
        q: 'Does mobile service cost more?',
        a: 'Often not — many auto glass shops include mobile service at no additional charge because it saves them shop space and time. Always confirm when you book.',
      },
    ],
  },
]

// Render FAQs as visible on-page content so the FAQ schema matches what a
// reader sees (a Google structured-data requirement).
function faqHtml(s: Seed): string {
  if (!s.faqs?.length) return ''
  const items = s.faqs
    .map(
      (f) =>
        `<h3>${f.q}</h3><p>${f.a}</p>`
    )
    .join('')
  return `<h2>Frequently asked questions</h2>${items}`
}

export const SEED_POSTS: Article[] = SEEDS.map((s, i) => ({
  // Negative ids keep seeds from ever colliding with BabyLoveGrowth article ids.
  id: -(i + 1),
  title: s.title,
  slug: s.slug,
  hero_image_url: s.image,
  meta_description: s.meta,
  excerpt: s.excerpt,
  publishedAt: s.date,
  content_html: s.html + faqHtml(s),
  jsonLd: articleJsonLd(s),
  faqJsonLd: faqJsonLd(s),
}))
