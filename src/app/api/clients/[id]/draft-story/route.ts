import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { secretSetting } from '@/lib/secret-settings'
import { asChapters } from '@/lib/site-content'
import {
  MAX_DRAFT_SECTIONS,
  screenStory,
  storyPrompt,
  type StoryInput,
} from '@/lib/story-sections'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — draft the story sections for a shop that has none.
 *
 * WRITES NOTHING, on purpose, the same as "suggest nearby cities": the draft
 * goes back to the editor, which owns the autosave, so what reaches the
 * database is what the operator is looking at. A route that saved its own
 * output would also race that autosave — the editor PUTs the whole document,
 * so whichever landed second would win.
 *
 * The fact-checking lives in `story-sections.ts` and runs over whatever comes
 * back. Read the comment at the top of that module before touching the prompt:
 * the rules are compliance rules, not style, and the screen is what keeps a
 * fluent invention out of a real business's website.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      businessName: true,
      city: true,
      state: true,
      marketArea: true,
      hasShopLocation: true,
      offersMobileService: true,
      filesInsuranceClaims: true,
      smsCapable: true,
      serviceAreas: true,
      offersWindshieldReplacement: true,
      offersWindshieldRepair: true,
      offersRockChipRepair: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersAdasCalibration: true,
      siteContent: { select: { footerBlurb: true, warrantyText: true, chapters: true } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.city || !client.state) {
    return NextResponse.json(
      { error: 'Set the shop’s city and state on the Business tab first — the draft is built from them.' },
      { status: 400 }
    )
  }

  const apiKey = await secretSetting('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key configured (Settings → API keys).' },
      { status: 503 }
    )
  }

  // Their own voice, where the site already has some. Not the warranty terms:
  // those are the one piece of copy the draft must not echo.
  const existingVoice = [
    client.siteContent?.footerBlurb || '',
    ...asChapters(client.siteContent?.chapters).map((c) => `${c.heading}\n${c.body}`),
  ].filter(Boolean)

  const input: StoryInput = {
    businessName: client.businessName,
    city: client.city,
    state: client.state,
    marketArea: client.marketArea,
    hasShopLocation: client.hasShopLocation,
    offersMobileService: client.offersMobileService,
    filesInsuranceClaims: client.filesInsuranceClaims,
    smsCapable: client.smsCapable,
    serviceAreas: client.serviceAreas || [],
    services: {
      offersWindshieldReplacement: client.offersWindshieldReplacement,
      offersWindshieldRepair: client.offersWindshieldRepair,
      offersRockChipRepair: client.offersRockChipRepair,
      offersSideWindowRepair: client.offersSideWindowRepair,
      offersBackWindowRepair: client.offersBackWindowRepair,
      offersSunroofRepair: client.offersSunroofRepair,
      offersAdasCalibration: client.offersAdasCalibration,
    },
    existingVoice,
  }

  let sections: Array<Record<string, unknown>>
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: storyPrompt(input) }],
    })
    if (message.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The model declined to draft this.' }, { status: 502 })
    }
    const block = message.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') {
      return NextResponse.json({ error: 'No text in the response.' }, { status: 502 })
    }
    const match = block.text.match(/\[[\s\S]*\]/)
    if (!match) {
      return NextResponse.json({ error: 'Could not read the draft that came back.' }, { status: 502 })
    }
    const parsed = JSON.parse(match[0]) as unknown
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'The draft was not a list of sections.' }, { status: 502 })
    }
    sections = parsed as Array<Record<string, unknown>>
  } catch (error) {
    console.error('Story section draft failed:', error)
    return NextResponse.json(
      {
        error: `Could not draft them: ${error instanceof Error ? error.message : 'model call failed'}`,
      },
      { status: 502 }
    )
  }

  const { kept, dropped } = screenStory(sections, input)

  // WHAT WAS THROWN AWAY IS PART OF THE ANSWER, not a log line. A screen that
  // fires silently looks exactly like a model that wrote two sections instead
  // of three, and the operator's next move — press it again — is the one that
  // cannot help.
  const note = kept.length
    ? `Drafted ${kept.length} section${kept.length === 1 ? '' : 's'} from what this app already knows about the shop.${
        dropped.length
          ? ` ${dropped.length} more ${dropped.length === 1 ? 'was' : 'were'} thrown away: ${dropped
              .map((d) => `“${d.heading}” ${d.reason}`)
              .join('; ')}.`
          : ''
      } Read each one and fix anything that is not true — nothing here knows their history, so that part is still yours to add.`
    : `Nothing usable came back. ${
        dropped.length
          ? `Every section made a claim we cannot back: ${dropped
              .map((d) => `“${d.heading}” ${d.reason}`)
              .join('; ')}.`
          : 'The draft was empty.'
      } Press it again — it is a fresh draft each time.`

  return NextResponse.json({ chapters: kept, dropped, note, max: MAX_DRAFT_SECTIONS })
}
