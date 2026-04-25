import type { AudioMetrics } from './audio-metrics'

interface ClientContext {
  businessName: string
  city: string | null
  state: string | null
}

interface DeepgramUtterance {
  speaker: number
  start: number
  end: number
  transcript: string
}

interface DeepgramResult {
  results?: { utterances?: DeepgramUtterance[] }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function buildCoachingPrompt({
  transcript,
  metrics,
  clientContext,
}: {
  transcript: DeepgramResult
  metrics: AudioMetrics
  clientContext: ClientContext
}): string {
  const utterances = transcript?.results?.utterances ?? []
  const repSpeaker = metrics.repSpeakerIndex

  const formattedTranscript = utterances
    .map((u) => {
      const speaker = u.speaker === repSpeaker ? 'REP' : 'CUSTOMER'
      const time = formatTime(u.start)
      return `[${time}] ${speaker}: ${u.transcript}`
    })
    .join('\n')

  const location = [clientContext.city, clientContext.state]
    .filter(Boolean)
    .join(', ') || 'Unknown'

  return `You are a sales coach analyzing an auto glass repair shop's inbound sales call. Your job is to score the call against a rubric and give the shop owner specific, actionable coaching.

CONTEXT:
- Shop: ${clientContext.businessName}
- Location: ${location}

TRANSCRIPT:
${formattedTranscript}

AUDIO METRICS:
- Total duration: ${metrics.durationSeconds}s
- Rep talk time: ${metrics.repTalkPct}%
- Customer talk time: ${metrics.customerTalkPct}%
- Times rep interrupted customer: ${metrics.interruptionsByRep}
- Longest silence: ${metrics.longestSilenceSeconds}s

SCORING RUBRIC (100 points total):

DISCOVERY (20 points)
- Asked vehicle year/make/model (5)
- Asked damage location and size (5)
- Asked about insurance vs cash payment (5)
- Asked location / mobile vs in-shop preference (5)

VALUE BUILDING (20 points)
- Mentioned specific differentiators - warranty, OEM glass, certified techs, ADAS calibration (10)
- Addressed insurance/deductible appropriately (5)
- Established urgency or safety concern when relevant (5)

SALES MECHANICS (30 points)
- Quoted price with value framing, not bare number (10)
- Asked for the appointment (10) — this is the most important
- Handled objections without immediate price concession (5)
- Got specific commitment - date/time, callback time, or clear next step (5)

COMMUNICATION (20 points)
- Rep talk ratio under 60% (5)
- No interruptions of customer (5)
- Friendly, professional tone (5)
- Clear next steps stated by both parties (5)

DEDUCTIONS (up to -15)
- Quoted price in first 60s without discovery (-5)
- Said "we'll call you back" without specific time (-5)
- Failed to capture contact info on uncertain lead (-5)

INSTRUCTIONS:
1. Score honestly. Most calls score 40-60. A 90+ is a genuinely excellent call.
2. Find at least one thing the rep did well, even on poor calls.
3. Identify up to 3 specific missed opportunities with the actual transcript quote and timestamp.
4. Determine the outcome: booked | quote_sent | callback_scheduled | lost | info_only
5. Write the coaching note in plain language to the shop owner. No jargon. 2-3 sentences.
6. The coaching note should be direct but constructive — this is visible to the client.

Return ONLY valid JSON in exactly this format, no markdown, no preamble:
{
  "score": 0,
  "subscores": {
    "discovery": 0,
    "value_building": 0,
    "sales_mechanics": 0,
    "communication": 0,
    "deductions": 0
  },
  "outcome": "booked",
  "missed_opportunities": [
    {
      "moment": "string",
      "transcript_quote": "string",
      "timestamp": "MM:SS",
      "what_should_have_happened": "string"
    }
  ],
  "did_well": ["string"],
  "coaching_note": "string",
  "sentiment": {
    "customer_overall": "positive",
    "rep_overall": "engaged",
    "key_emotional_moment": null
  },
  "tags": ["string"]
}`
}
