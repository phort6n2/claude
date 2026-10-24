import Anthropic from '@anthropic-ai/sdk'
import { secretSetting } from '@/lib/secret-settings'
import { CONFIDENCE_LABELS, reasonLabel, readProposals, type Candidate, type NegativeProposal, type ShopFacts } from '@/lib/bad-lead'
import type { TraceResult } from '@/lib/bad-lead-trace'

/**
 * The model picks the negative keywords. It is a source of JUDGEMENT here,
 * not of facts: it sees only the searches Google reported and the lead's own
 * words, and every term it returns is screened by `negativeProblems` — a word
 * that is not in a reported search cannot be added without a person, however
 * sensible it sounds. The point of the model is the part a rule cannot do:
 * reading "hawthorne auto clinic" as a mechanic, "west can near me" as a
 * competitor's name typed badly, and a caller saying "is this AAA?" as the
 * answer to which of eighteen one-click PMax searches it was.
 */

export interface AiDecision {
  ok: boolean
  proposals: NegativeProposal[]
  noneReason: string | null
  error?: string
  model?: string
}

function money(micros: number): string {
  return `$${(micros / 1e6).toFixed(2)}`
}

function candidateLines(list: Candidate[]): string {
  return list
    .map(
      (c, i) =>
        `${i + 1}. "${c.term}" — ${c.clicks} click${c.clicks === 1 ? '' : 's'}, ${money(c.costMicros)}` +
        (c.keyword ? `, keyword "${c.keyword}" (${(c.keywordMatchType || '').toLowerCase()})` : '') +
        (c.bestMatch ? ` — BEST MATCH: ${c.bestWhy}` : '')
    )
    .join('\n')
}

export function buildPrompt(input: {
  shop: ShopFacts
  reason: string
  notes: string | null
  leadText: string | null
  trace: TraceResult
}): string {
  const { shop, trace } = input
  const services = [
    'windshield replacement',
    shop.offersWindshieldRepair || shop.offersRockChipRepair ? 'windshield / chip repair' : null,
    'side and back glass',
    shop.offersAdasCalibration ? 'ADAS camera calibration' : null,
    shop.offersSunroofRepair ? 'sunroof glass' : null,
    shop.offersMobileService ? 'mobile service' : null,
  ].filter(Boolean)
  const places = [shop.city, shop.marketArea, ...shop.serviceAreas].filter(Boolean)

  return `You manage Google Ads for an auto glass shop. A lead from the ads was junk, and your job is to choose negative keywords so the account stops paying for searches like the one that produced it.

THE SHOP
- Name: ${shop.businessName}${shop.brandTerms.length ? ` (brand terms: ${shop.brandTerms.join(', ')})` : ''}
- Sells: ${services.join(', ')}
- Serves: ${places.join(', ') || 'not stated'}

THE BAD LEAD
- Marked as: ${reasonLabel(input.reason)}${input.notes ? `\n- The shop’s note: ${input.notes}` : ''}${input.leadText ? `\n- What the customer said or wrote:\n${input.leadText}` : ''}

THE TRACE
- How sure: ${CONFIDENCE_LABELS[trace.confidence]}. ${trace.note}
- Campaign: ${trace.campaign ? `${trace.campaign.name}${trace.campaign.channel === 'PERFORMANCE_MAX' ? ' (Performance Max)' : ''}` : 'unknown'}${trace.adGroup ? ` › ${trace.adGroup.name}` : ''}
${trace.keyword ? `- The click matched keyword "${trace.keyword.text}" (${trace.keyword.matchType.toLowerCase()})\n` : ''}- Searches with clicks that day (Google gives search terms per day, not per hour):
${candidateLines(trace.allCandidates) || '(none reported)'}

RULES
1. Every negative must be words taken from ONE of the searches listed above — the whole search, or a shorter run of consecutive words from it. Never add a word that is not in a listed search.
2. Never the shop’s own name, a service it sells, or a place it serves. Never anything about glass, windshields or windows.
3. Never a competing AUTO GLASS shop’s name — those searchers can still be customers.
4. Prefer the shortest phrase that is clearly junk on its own and still says what kind of junk it is: "aaa oregon" → phrase "aaa oregon"; "hawthorne auto clinic" → phrase "auto clinic" or "hawthorne auto clinic". A single word only when it can never be part of an auto glass search.
5. match_type is "PHRASE" or "EXACT". Use EXACT when only that exact search is junk. Never BROAD.
6. If there is a BEST MATCH and it fits the reason, it must be one of your negatives.
7. If the trace is not exact (hour match or same day), only negate searches that clearly fit "${reasonLabel(input.reason)}" — you do not know which one was this lead, so leave anything that could be a real customer.
8. If the shop’s note or the customer’s own words show they DID want auto glass — they asked for a price, did not book, went with someone else, or simply never answered — return NO negatives and say so. That is a real customer from a search the ads should keep buying; blocking it costs the next job.
9. At most 5. It is fine to return none — say why.

Return ONLY JSON, no other text:
{"negatives":[{"text":"…","match_type":"PHRASE","from_term":"the search it came from","why":"one short sentence"}],"none_reason":null}`
}

export async function decideNegatives(input: Parameters<typeof buildPrompt>[0]): Promise<AiDecision> {
  const key = await secretSetting('ANTHROPIC_API_KEY')
  if (!key) return { ok: false, proposals: [], noneReason: null, error: 'No Anthropic API key configured.' }
  if (input.trace.allCandidates.length === 0) return { ok: true, proposals: [], noneReason: 'Google reported no searches to choose from.' }
  const model = 'claude-opus-5'
  try {
    const anthropic = new Anthropic({ apiKey: key })
    const message = await anthropic.messages.create({
      model,
      /* The model THINKS BY DEFAULT and pays for it out of max_tokens; a
         budget sized for the answer alone stops before the answer
         (scripts/check-model-budgets.ts). */
      max_tokens: 6000,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    console.log(`[BadLead] model stop=${message.stop_reason} out=${message.usage?.output_tokens} text=${text.length}ch`)
    if (message.stop_reason === 'refusal') return { ok: false, proposals: [], noneReason: null, error: 'The model declined.', model }
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) {
      console.warn(`[BadLead] unreadable reply: ${text.slice(0, 400)}`)
      return { ok: false, proposals: [], noneReason: null, error: `The model answered in words: ${text.trim().slice(0, 160)}`, model }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch (e) {
      console.warn(`[BadLead] malformed JSON: ${text.slice(0, 400)}`)
      return { ok: false, proposals: [], noneReason: null, error: `Malformed JSON from the model (${e instanceof Error ? e.message : 'parse error'}).`, model }
    }
    const noneReason = (parsed as { none_reason?: unknown })?.none_reason
    return {
      ok: true,
      proposals: readProposals(parsed),
      noneReason: typeof noneReason === 'string' && noneReason.trim() ? noneReason.trim().slice(0, 300) : null,
      model,
    }
  } catch (error) {
    console.error('[BadLead] model call failed:', error)
    return { ok: false, proposals: [], noneReason: null, error: error instanceof Error ? error.message : 'Model call failed', model }
  }
}
