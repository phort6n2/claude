import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { secretSetting } from '@/lib/secret-settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — turn a shop's shorthand warranty ("labor") into publishable terms.
 *
 * The tight rope this walks: §2 says a named warranty must state its terms,
 * and it ALSO says never invent a fact about a business. So the prompt is a
 * rewriter, not an author — it may say what the given words mean in plain
 * language, and it may NOT add what the shop never said: no durations, no
 * dollar figures, no exclusions, no coverage beyond the input. "Labor"
 * becomes a clear sentence about workmanship being made right; it does not
 * become "lifetime" anything. The admin reads the result in the editor
 * before it goes anywhere, same as text they typed themselves.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { businessName: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text && !title) {
    return NextResponse.json(
      { error: 'There is nothing to expand — type what the warranty covers first, even a word.' },
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

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `You are writing the warranty section for an auto glass shop's website. The shop gave us only this:

Warranty name: ${title || '(none given)'}
What they said it covers: ${text || '(nothing — only the name above)'}

Rewrite this as 2–4 plain, customer-facing sentences that state what the warranty covers.

HARD RULES — these come from advertising-compliance review and are not style preferences:
- Say ONLY what their words mean. Expand shorthand into plain language; do not add coverage.
- NO durations ("lifetime", "12 months") unless their words contain one. If they gave one, keep it exactly.
- NO dollar amounts, NO deductible language, NO insurance claims of any kind.
- NO exclusions or conditions they did not state.
- If they wrote "labor" or "workmanship", that means: problems caused by the installation itself (leaks, wind noise, loose trim) will be corrected at no charge. Nothing more.
- Write as the shop ("we"), plainly, no marketing superlatives.

Return ONLY the warranty text, no preamble, no quotes.`,
        },
      ],
    })
    const block = message.content.find((b) => b.type === 'text')
    const draft = block && block.type === 'text' ? block.text.trim() : ''
    if (!draft) {
      return NextResponse.json({ error: 'The model returned nothing usable.' }, { status: 502 })
    }
    return NextResponse.json({ text: draft })
  } catch (error) {
    return NextResponse.json(
      { error: `Could not expand it: ${error instanceof Error ? error.message : 'model call failed'}` },
      { status: 502 }
    )
  }
}
