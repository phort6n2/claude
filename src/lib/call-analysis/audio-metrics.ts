type Utterance = {
  speaker: number
  start: number
  end: number
  transcript: string
}

export interface AudioMetrics {
  durationSeconds: number
  repTalkSeconds: number
  customerTalkSeconds: number
  repTalkPct: number
  customerTalkPct: number
  interruptionsByRep: number
  longestSilenceSeconds: number
  repSpeakerIndex: number
}

export function computeAudioMetrics(deepgramResult: unknown): AudioMetrics | null {
  const result = deepgramResult as {
    results?: { utterances?: Utterance[] }
    metadata?: { duration?: number }
  } | null

  const utterances = result?.results?.utterances ?? []
  if (utterances.length === 0) return null

  const totalDuration = result?.metadata?.duration ?? 0

  // For inbound calls the rep answers first, so the first utterance speaker is
  // the rep. Outbound calls would invert this; we don't currently distinguish.
  const repSpeaker = utterances[0].speaker

  let repTalkTime = 0
  let customerTalkTime = 0
  let interruptions = 0
  let longestSilence = 0
  let lastEnd = 0

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i]
    const duration = Math.max(0, u.end - u.start)

    if (u.speaker === repSpeaker) {
      repTalkTime += duration
    } else {
      customerTalkTime += duration
    }

    if (i > 0) {
      const gap = u.start - lastEnd
      if (gap > longestSilence) longestSilence = gap

      const prev = utterances[i - 1]
      if (
        u.speaker === repSpeaker &&
        prev.speaker !== repSpeaker &&
        u.start < prev.end
      ) {
        interruptions++
      }
    }
    lastEnd = u.end
  }

  const totalTalkTime = repTalkTime + customerTalkTime

  return {
    durationSeconds: Math.round(totalDuration),
    repTalkSeconds: Math.round(repTalkTime),
    customerTalkSeconds: Math.round(customerTalkTime),
    repTalkPct:
      totalTalkTime > 0 ? Math.round((repTalkTime / totalTalkTime) * 100) : 0,
    customerTalkPct:
      totalTalkTime > 0 ? Math.round((customerTalkTime / totalTalkTime) * 100) : 0,
    interruptionsByRep: interruptions,
    longestSilenceSeconds: Math.round(longestSilence),
    repSpeakerIndex: repSpeaker,
  }
}
