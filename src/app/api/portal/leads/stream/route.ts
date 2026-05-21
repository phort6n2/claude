import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const POLL_INTERVAL_MS = 1500
const HEARTBEAT_INTERVAL_MS = 15000
// Self-close just under `maxDuration` so the browser's EventSource reconnects
// cleanly. Longer windows mean fewer reconnect cycles per hour, slightly
// cheaper in compute overhead.
const CLOSE_AFTER_MS = 55000

/**
 * SSE endpoint for the client portal. Pushes leads created for the
 * authenticated portal user's client in near real time. Same mechanics as
 * the admin stream: internal DB polling every ~1.5s, auto-close after ~25s
 * so the browser's EventSource reconnects cleanly.
 */
export async function GET(request: NextRequest) {
  const session = await getPortalSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date') // YYYY-MM-DD
  const sinceParam = searchParams.get('since')

  // Resolve the day range in the client's timezone (same logic as
  // /api/portal/leads), if a date is supplied.
  const dateRange: Record<string, Date> = {}
  if (dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number)
    const tzOffset = new Date().toLocaleString('en-US', {
      timeZone: session.timezone,
      timeZoneName: 'shortOffset',
    })
    const offsetMatch = tzOffset.match(/GMT([+-]\d+)/)
    const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0
    dateRange.gte = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0))
    dateRange.lte = new Date(
      Date.UTC(year, month - 1, day, -offsetHours + 23, 59, 59, 999)
    )
  }

  // Prefer Last-Event-ID (set automatically by EventSource on reconnect) so we
  // never lose leads across the ~25s auto-close → reconnect cycle.
  const lastEventId = request.headers.get('Last-Event-ID')
  let lastSeen = lastEventId
    ? new Date(lastEventId)
    : sinceParam
      ? new Date(sinceParam)
      : new Date()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        clearTimeout(autoClose)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return
        try {
          const idLine = id ? `id: ${id}\n` : ''
          controller.enqueue(
            encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {
          close()
        }
      }

      send('connected', { since: lastSeen.toISOString() })

      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          close()
        }
      }, HEARTBEAT_INTERVAL_MS)

      const autoClose = setTimeout(close, CLOSE_AFTER_MS)
      request.signal.addEventListener('abort', close)

      const poll = async () => {
        if (closed) return
        try {
          const createdAt: Record<string, Date> = { gt: lastSeen, ...dateRange }
          const newLeads = await prisma.lead.findMany({
            where: { clientId: session.clientId, createdAt },
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              status: true,
              source: true,
              formName: true,
              formData: true,
              quoteValue: true,
              saleValue: true,
              saleDate: true,
              saleNotes: true,
              callRecordingUrl: true,
              gclid: true,
              enhancedConversionSent: true,
              offlineConversionSent: true,
              createdAt: true,
              statusUpdatedAt: true,
              callAnalyses: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, status: true, score: true, outcome: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 25,
          })
          if (newLeads.length > 0) {
            lastSeen = newLeads[0].createdAt
            for (const { callAnalyses, ...rest } of [...newLeads].reverse()) {
              send(
                'lead',
                { ...rest, callAnalysis: callAnalyses[0] ?? null },
                rest.createdAt.toISOString()
              )
            }
          }
        } catch (err) {
          console.error('[portal/leads/stream] poll error', err)
        }
        if (!closed) {
          setTimeout(poll, POLL_INTERVAL_MS)
        }
      }
      setTimeout(poll, POLL_INTERVAL_MS)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
