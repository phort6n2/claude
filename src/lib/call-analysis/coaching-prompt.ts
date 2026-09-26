import type { AudioMetrics } from './audio-metrics'
import { FOCUS_AREAS, FOCUS_AREA_CODES, COMPETENT_SCORE, BOOKED_SCORE_FLOOR } from './rating'

// Rendered into the prompt so the model can only choose from the fixed
// taxonomy — free-text missed opportunities can't be aggregated reliably.
const FOCUS_AREA_CODE_LIST = FOCUS_AREA_CODES.map(
  (code) => `   - ${code}: ${FOCUS_AREAS[code]}`
).join('\n')

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

FIRST, IS THIS A SALES CALL?
Some calls are not a customer trying to buy: an existing customer checking on
their job, a parts or vendor call, "what are your hours", a wrong number. Mark
those outcome "info_only" and do NOT grade them against the sales rubric below
— answering a question well is the whole job on that call. For an info_only
call, score 0-100 on how clearly and warmly the question was answered and
whether the caller was left with an easy way to come back, and list a missed
opportunity only if there was a real opening to book work that went unused.

SCORING RUBRIC for sales calls (100 points total):

DISCOVERY (20 points)
- Asked vehicle year/make/model (5)
- Asked damage location and size (5)
- Asked about insurance vs cash payment (5)
- Asked location / mobile vs in-shop preference (5)

VALUE BUILDING (20 points)
- Said something specific about why to choose THIS shop (10). Credit whatever
  the rep actually said — a warranty, the glass they use, coming to the
  customer, calibration, how long they have been doing it. NEVER deduct for a
  particular claim being absent (certifications, OEM glass, a named warranty):
  this shop may not have it, and a missing claim is not a missed opportunity.
  Never suggest the rep say anything about the shop that the transcript does
  not show is true.
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

HOW TO GIVE THE FEEDBACK. The reader is a working adult who is good at their
job. Feedback that helps adults improve has these properties, and every word
you write must follow them:
- About the CALL, never the person. Name specific moments and what was said
  ("when the customer asked about price at 1:12 ..."), not traits ("you are
  pushy", "you need to be more confident"). Never "you failed", "you forgot",
  "you should have".
- Praise is SPECIFIC and GENUINE, and it stands on its own. Quote the moment.
  Never use praise as a warm-up for criticism, and never pivot from praise to a
  tip with "but" or "however" — people learn to distrust praise that always
  comes before a "but".
- Tips look FORWARD. Say what to try next time, with the actual words the rep
  could use, not a description of what went wrong.
- Few, not many. One thing to work on in the coaching note; up to three in
  missed_opportunities, and fewer is better when the call went well.

INSTRUCTIONS:
1. BOOKING THE JOB IS THE POINT, AND A BOOKED CALL IS CELEBRATED. If the rep
   booked the appointment, score it ${BOOKED_SCORE_FLOOR} or above even if the technique was
   rough. The coaching note is praise only: name specifically what the rep did
   that won the job — no tip in the note at all. List at least two specific
   things in did_well. Include a missed_opportunity only if something genuinely
   put the booking at risk, at most one, written as a way to make the next one
   even smoother. Apply no deductions.
2. Grade like a supportive coach, not an auditor. A competent call that moves
   the customer forward belongs in the ${COMPETENT_SCORE}-80 range. Reserve scores under 50 for
   calls where the rep clearly mishandled a real opportunity. Do not nitpick a
   call that went fine.
3. Find at least one genuine, specific thing the rep did well on every call.
4. Identify up to 3 specific missed opportunities with the actual transcript
   quote and timestamp. "what_should_have_happened" is a forward-looking tip:
   what to say or do next time, in words the rep could actually use. Every
   missed opportunity MUST include a "focus_area" set to exactly one of these
   codes:
${FOCUS_AREA_CODE_LIST}
   Pick the single code that best fits. Do not invent new codes.
5. Determine the outcome: booked | quote_sent | callback_scheduled | lost | info_only
6. Write the coaching note in plain language to the shop owner. No jargon. 2-3
   sentences. Start with the specific thing that went well. If this was not a
   booked call, add at most ONE thing to try next time, as its own sentence
   beginning "Next time," — never joined to the praise with "but". It is fine,
   once, to say the rep is already close. This is visible to the client — keep
   it encouraging and specific, never scolding.
7. If you apply any deductions, list each one in deductions_applied with the
   specific reason and the exact points subtracted (-5 each). subscores.deductions
   should equal the sum of points across deductions_applied. Do not apply
   deductions on a call that booked the job or on an info_only call. If no
   deductions apply, return an empty array and subscores.deductions = 0.
8. rep_name: the first name the REP gives for themselves in the call ("this is
   Mike", "Mike speaking"), exactly as they said it. Only a name the rep says
   about themselves — never the customer's name, never a guess. If the rep does
   not say their own name, return null.

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
  "rep_name": null,
  "missed_opportunities": [
    {
      "moment": "string",
      "transcript_quote": "string",
      "timestamp": "MM:SS",
      "what_should_have_happened": "string",
      "focus_area": "ask_for_appointment"
    }
  ],
  "deductions_applied": [
    {
      "reason": "string",
      "points": -5
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
