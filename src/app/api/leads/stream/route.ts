import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
// Node runtime so Prisma works. Vercel Pro caps Node functions at 60s; we close
// the stream ourselves before that so the client's EventSource reconnects to a
// fresh function instance.
export const maxDuration = 60

const POLL_INTERVAL_MS = 1500
const HEARTBEAT_INTERVAL_MS = 15000
// Self-close just under `maxDuration` so the browser's EventSource reconnects
// cleanly. Longer windows mean fewer reconnect cycles per hour, slightly
// cheaper in compute overhead.
const CLOSE_AFTER_MS = 55000

/**
 * SSE endpoint that pushes newly-created leads to the client in near real time.
 *
 * Each connection internally polls the DB every ~1.5s for leads created after
 * the last seen `createdAt`. When new leads are found, they're streamed as
 * `event: lead` messages. The connection auto-closes after ~25s and the
 * browser's EventSource reconnects.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const status = searchParams.get('status')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const sinceParam = searchParams.get('since')

  // Build the date-range filter once. New leads must be both within the page's
  // date filter (if any) AND newer than `lastSeen`.
  const baseWhere: Record<string, unknown> = {}
  if (clientId) baseWhere.clientId = clientId
  if (status) baseWhere.status = status
  const dateRange: Record<string, Date> = {}
  if (startDate) dateRange.gte = new Date(startDate)
  if (endDate) dateRange.lte = new Date(endDate)

  // On reconnects EventSource sends the id of the last event it received in the
  // `Last-Event-ID` header. Prefer that over the query param so we don't miss
  // anything between the auto-close and the browser's reconnect.
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

      // Initial frame so the client knows we're connected.
      send('connected', { since: lastSeen.toISOString() })

      // Keep proxies / nginx / Cloudflare from buffering the response shut.
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          close()
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Close before the function-duration cap so the client reconnects cleanly.
      const autoClose = setTimeout(close, CLOSE_AFTER_MS)

      // Client navigated away / closed the tab.
      request.signal.addEventListener('abort', close)

      // Poll loop — runs until closed.
      const poll = async () => {
        if (closed) return
        try {
          const createdAt: Record<string, Date> = { gt: lastSeen, ...dateRange }
          const newLeads = await prisma.lead.findMany({
            where: { ...baseWhere, createdAt },
            include: {
              client: { select: { id: true, businessName: true, slug: true } },
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
            // Bump the cursor to the newest createdAt we just saw.
            lastSeen = newLeads[0].createdAt
            // Send oldest-first so the client can prepend each one and end up
            // with the newest at the top. The event id is the createdAt ISO
            // string so EventSource can resume cleanly on reconnect.
            for (const { callAnalyses, ...rest } of [...newLeads].reverse()) {
              send(
                'lead',
                { ...rest, callAnalysis: callAnalyses[0] ?? null },
                rest.createdAt.toISOString()
              )
            }
          }
        } catch (err) {
          console.error('[leads/stream] poll error', err)
        }
        if (!closed) {
          setTimeout(poll, POLL_INTERVAL_MS)
        }
      }
      setTimeout(poll, POLL_INTERVAL_MS)
    },
    cancel() {
      // Reader cancelled; the start()'s abort listener handles cleanup.
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
