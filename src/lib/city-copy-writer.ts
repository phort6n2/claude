import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { CITY_CONTENT_MIN_WORDS } from '@/lib/city-content'

/**
 * Drafts the city-specific copy that keeps a location page from being a
 * doorway page.
 *
 * The whole risk here is that a model asked to "write about auto glass in
 * Beaverton" produces exactly the fluent, generic paragraph the doorway rule
 * exists to catch — and worse, invents facts about a business it knows
 * nothing about. So the prompt is built only from what this client's record
 * actually says, and it is told in detail what it may not claim.
 *
 * The output is a DRAFT. It lands in the editor for a human to read and
 * correct before it is saved, because a model cannot know whether the shop
 * really does keep OEM glass for the trucks common on that side of town.
 */

async function apiKey(): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'ANTHROPIC_API_KEY' } })
    if (setting) {
      if (setting.encrypted) {
        try {
          return decrypt(setting.value)
        } catch {
          return null
        }
      }
      return setting.value
    }
  } catch {
    // fall through to env
  }
  return process.env.ANTHROPIC_API_KEY || null
}

export interface CityCopyInput {
  clientId: string
  city: string
}

export interface CityCopyDraft {
  heading: string
  body: string
}

export async function draftCityCopy(
  input: CityCopyInput
): Promise<{ ok: true; draft: CityCopyDraft } | { ok: false; error: string }> {
  const key = await apiKey()
  if (!key) return { ok: false, error: 'No Anthropic API key configured (Settings → API keys).' }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: {
      businessName: true,
      city: true,
      state: true,
      serviceAreas: true,
      hasShopLocation: true,
      offersMobileService: true,
      offersWindshieldRepair: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
      locations: {
        select: { label: true, city: true, state: true, streetAddress: true, hours: true },
      },
      siteContent: { select: { chapters: true, warrantyText: true } },
    },
  })
  if (!client) return { ok: false, error: 'Client not found' }

  const services = [
    client.offersWindshieldReplacement && 'windshield replacement',
    client.offersWindshieldRepair && 'windshield repair',
    client.offersRockChipRepair && 'rock chip repair',
    client.offersSideWindowRepair && 'side window replacement',
    client.offersBackWindowRepair && 'back glass replacement',
    client.offersSunroofRepair && 'sunroof glass',
    client.offersAdasCalibration && 'ADAS calibration',
  ].filter(Boolean) as string[]

  const shopHere = client.locations.find(
    (l) => l.city.trim().toLowerCase() === input.city.trim().toLowerCase()
  )
  const otherShops = client.locations.filter((l) => l !== shopHere)

  // Only what the record actually contains. Anything absent stays absent —
  // the model cannot ask, so it must not guess.
  const facts = [
    `Business: ${client.businessName}`,
    `Home base: ${client.city}, ${client.state}`,
    `Page is about: ${input.city}, ${client.state}`,
    `Services offered: ${services.join(', ') || 'auto glass'}`,
    client.offersMobileService
      ? 'Runs a mobile unit that travels to the customer.'
      : 'Does not offer mobile service — customers come to the shop.',
    shopHere
      ? `HAS A SHOP IN THIS CITY: ${shopHere.streetAddress}, ${shopHere.city}${shopHere.hours ? ` (${shopHere.hours})` : ''}`
      : 'NO shop in this city — it is served from elsewhere.',
    otherShops.length
      ? `Other shops: ${otherShops.map((l) => `${l.label} (${l.city})`).join(', ')}`
      : '',
    `Other cities covered: ${(client.serviceAreas || []).filter((a) => a.toLowerCase() !== input.city.toLowerCase()).join(', ') || 'none listed'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const ownWords =
    Array.isArray(client.siteContent?.chapters) && client.siteContent.chapters.length
      ? JSON.stringify(client.siteContent.chapters).slice(0, 3000)
      : '(none on file)'

  const prompt = `You are drafting one short section for the ${input.city} page of a local auto glass company's website. A human will read and correct it before it is published.

THE PROBLEM YOU ARE SOLVING
This company has a page per city. Those pages are currently near-identical to each other, which Google classifies as doorway pages and penalises across the whole account. Your job is to write something that is specifically about ${input.city} and could NOT be pasted onto another city's page with the name swapped.

WHAT YOU KNOW (this is everything — you have no other source)
${facts}

THE COMPANY'S OWN WORDS ELSEWHERE ON THE SITE (match this voice; do not repeat it):
${ownWords}

HARD RULES — breaking any of these makes the draft unusable
1. Invent NO facts about this business. Not years in business, not staff numbers, not certifications, not brands stocked, not response times, not the number of jobs done. If it is not in the list above, it does not exist.
2. Invent NO prices, no discounts, and never mention insurance deductibles.
3. Claim NO relationship with any insurer or manufacturer.
4. Do not promise a timeframe ("same day", "within an hour"). Scheduling is not yours to promise.
5. ${shopHere ? `There IS a shop in ${input.city} — you may say so and give the street.` : `There is NO shop in ${input.city}. Never imply one. The relationship is ${client.offersMobileService ? 'the mobile unit travelling there' : 'customers travelling to the shop'}.`}
6. You MAY write about the CITY itself — roads, highways, weather, terrain, the kind of driving done there, what causes glass damage there — because that is public knowledge about a place, not a claim about this business. This is where the uniqueness should come from.
7. No superlatives, no marketing padding, no "nestled in the heart of".

LENGTH: ${CITY_CONTENT_MIN_WORDS + 30}–140 words of body. Two short paragraphs at most.

Return ONLY this JSON, no other text:
{"heading": "a plain heading naming the city, under 60 characters", "body": "the copy"}`

  try {
    const anthropic = new Anthropic({ apiKey: key })
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })
    if (message.stop_reason === 'refusal') {
      return { ok: false, error: 'The model declined to draft this.' }
    }
    const block = message.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') return { ok: false, error: 'No text in the response.' }

    const match = block.text.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: 'Could not read the draft.' }
    const parsed = JSON.parse(match[0]) as Partial<CityCopyDraft>
    if (!parsed.body) return { ok: false, error: 'The draft came back empty.' }

    return {
      ok: true,
      draft: {
        heading: (parsed.heading || `Auto glass in ${input.city}`).slice(0, 80),
        body: parsed.body.trim(),
      },
    }
  } catch (error) {
    console.error('City copy draft failed:', error)
    return { ok: false, error: error instanceof Error ? error.message : 'Draft failed' }
  }
}
