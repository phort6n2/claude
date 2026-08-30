import Anthropic from '@anthropic-ai/sdk'
import { createClient as createDeepgramClient } from '@deepgram/sdk'
import { Prisma } from '@prisma/client'

import { prisma, withRetry } from '@/lib/db'
import { computeAudioMetrics } from './audio-metrics'
import { buildCoachingPrompt } from './coaching-prompt'

interface CoachingAnalysis {
  score: number
  subscores: {
    discovery: number
    value_building: number
    sales_mechanics: number
    communication: number
    deductions: number
  }
  outcome: string
  missed_opportunities: Array<{
    moment: string
    transcript_quote: string
    timestamp: string
    what_should_have_happened: string
    /** Code from the FOCUS_AREAS taxonomy; drives the per-client top 3. */
    focus_area?: string
  }>
  deductions_applied?: Array<{ reason: string; points: number }>
  did_well: string[]
  coaching_note: string
  sentiment: {
    customer_overall: string
    rep_overall: string
    key_emotional_moment: string | null
  }
  tags: string[]
}

function parseJsonResponse(text: string): CoachingAnalysis {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(cleaned) as CoachingAnalysis
}

async function markFailed(id: string, message: string) {
  await withRetry(() =>
    prisma.callAnalysis.update({
      where: { id },
      data: { status: 'FAILED', errorMessage: message.slice(0, 4000) },
    })
  ).catch(() => {})
}

/**
 * Run the full call-analysis pipeline for a single CallAnalysis row.
 *
 * The row should already exist in PENDING status. Each step updates the row's
 * status so the portal can show progress while polling.
 *
 * Returns true on success, false on any failure (which is logged into the
 * row's errorMessage field).
 */
export async function runCallAnalysisPipeline(callAnalysisId: string): Promise<boolean> {
  const row = await prisma.callAnalysis.findUnique({
    where: { id: callAnalysisId },
    include: { client: true },
  })
  if (!row) {
    console.error(`[CallAnalysis] Row not found: ${callAnalysisId}`)
    return false
  }
  if (row.status === 'COMPLETE') {
    return true
  }
  if (!row.recordingUrl) {
    await markFailed(callAnalysisId, 'No recording URL on call analysis row')
    return false
  }

  // Settings → API keys first, env second — a key saved through the
  // Settings screen must work here too, not only for the features that
  // happened to read the table.
  const { secretSetting } = await import('@/lib/secret-settings')
  const deepgramKey = await secretSetting('DEEPGRAM_API_KEY')
  const anthropicKey = await secretSetting('ANTHROPIC_API_KEY')
  if (!deepgramKey) {
    await markFailed(callAnalysisId, 'No Deepgram API key configured (Settings → API keys)')
    return false
  }
  if (!anthropicKey) {
    await markFailed(callAnalysisId, 'No Anthropic API key configured (Settings → API keys)')
    return false
  }

  try {
    // Step 1: Transcribe via Deepgram (fed the original HighLevel URL directly,
    // no intermediate blob storage).
    await prisma.callAnalysis.update({
      where: { id: callAnalysisId },
      data: { status: 'TRANSCRIBING', errorMessage: null },
    })

    const deepgram = createDeepgramClient(deepgramKey)
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: row.recordingUrl },
      {
        model: 'nova-3',
        diarize: true,
        punctuate: true,
        smart_format: true,
        utterances: true,
        detect_language: false,
        language: 'en-US',
      }
    )

    if (error) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message: unknown }).message)
            : String(error)
      await markFailed(callAnalysisId, `Deepgram error: ${msg}`)
      return false
    }

    const transcriptJson = (result ?? {}) as unknown as Prisma.InputJsonValue
    const duration =
      (result as { metadata?: { duration?: number } } | null)?.metadata?.duration ?? 0

    await prisma.callAnalysis.update({
      where: { id: callAnalysisId },
      data: {
        transcript: transcriptJson,
        durationSeconds: Math.round(duration),
      },
    })

    // Step 2: Compute audio metrics
    const metrics = computeAudioMetrics(result)
    if (!metrics) {
      await markFailed(callAnalysisId, 'Transcript contained no utterances')
      return false
    }

    await prisma.callAnalysis.update({
      where: { id: callAnalysisId },
      data: {
        audioMetrics: metrics as unknown as Prisma.InputJsonValue,
      },
    })

    // Step 3: Run Claude analysis
    await prisma.callAnalysis.update({
      where: { id: callAnalysisId },
      data: { status: 'ANALYZING' },
    })

    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const prompt = buildCoachingPrompt({
      transcript: result as unknown as Parameters<typeof buildCoachingPrompt>[0]['transcript'],
      metrics,
      clientContext: {
        businessName: row.client.businessName,
        city: row.client.city,
        state: row.client.state,
      },
    })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined
    if (!textBlock) {
      await markFailed(callAnalysisId, 'Claude returned no text content')
      return false
    }

    let analysis: CoachingAnalysis
    try {
      analysis = parseJsonResponse(textBlock.text)
    } catch (err) {
      await markFailed(
        callAnalysisId,
        `Failed to parse Claude JSON: ${(err as Error).message}. Raw: ${textBlock.text.slice(0, 500)}`
      )
      return false
    }

    // Step 4: Persist final results.
    //
    // Retried hard: by this point transcription and the Claude analysis have
    // both been paid for, so losing the write to a momentary pool timeout
    // throws away the whole call's work and leaves the row stuck mid-pipeline.
    await withRetry(
      () =>
        prisma.callAnalysis.update({
          where: { id: callAnalysisId },
          data: {
            status: 'COMPLETE',
            analysis: analysis as unknown as Prisma.InputJsonValue,
            score: analysis.score,
            outcome: analysis.outcome,
            completedAt: new Date(),
            errorMessage: null,
          },
        }),
      { maxRetries: 5, delayMs: 500 }
    )

    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[CallAnalysis] Pipeline failed for ${callAnalysisId}:`, err)
    await markFailed(callAnalysisId, message)
    return false
  }
}
