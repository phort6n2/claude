import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'
import { prisma } from '@/lib/db'
import { sendTestAlert } from '@/lib/test-alert'

export const dynamic = 'force-dynamic'

/**
 * The walkthrough's write side. The shop can stamp exactly four things, all
 * about themselves: "send me the test", "the test arrived", "the portal is
 * on my phone", "stop showing me this". Everything else on the checklist is
 * derived from data the portal already holds, so there is nothing else to
 * write — a checklist you can tick without doing is a checklist nobody
 * trusts, starting with us.
 */
export async function POST(request: NextRequest) {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const clientId = session.clientId
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const now = new Date()

  const stamp = async (data: Record<string, Date>) => {
    await prisma.clientOnboarding.upsert({
      where: { clientId },
      update: data,
      create: { clientId, ...data },
    })
  }

  try {
    if (action === 'send-test') {
      const [row, notification] = await Promise.all([
        prisma.clientOnboarding.findUnique({ where: { clientId } }).catch(() => null),
        prisma.clientNotification.findUnique({
          where: { clientId },
          select: { emailEnabled: true, emailTo: true, smsEnabled: true, smsTo: true },
        }),
      ])

      const hasRecipients =
        (notification?.emailEnabled && (notification?.emailTo?.length ?? 0) > 0) ||
        (notification?.smsEnabled && (notification?.smsTo?.length ?? 0) > 0)
      if (!hasRecipients) {
        return NextResponse.json(
          { error: 'No alert recipients are set up yet — get in touch and we will point them at you.' },
          { status: 400 }
        )
      }

      // One a minute. The likely double-tap is someone whose first test IS in
      // spam pressing the button again instead of looking there — the second
      // send would land in the same folder and teach nothing.
      if (row?.testAlertSentAt && now.getTime() - row.testAlertSentAt.getTime() < 60_000) {
        return NextResponse.json(
          { error: 'A test just went out. Give it a minute, and check the spam folder before sending another.' },
          { status: 429 }
        )
      }

      const sent = await sendTestAlert(clientId, 'form')
      if (!('result' in sent)) {
        return NextResponse.json({ error: sent.error }, { status: 500 })
      }
      // Nothing left the building: that is OUR failure, and telling the shop
      // "sent — go check" would send them hunting a spam folder for a message
      // that does not exist. Only a real handoff stamps the clock.
      if (sent.result.emailSent + sent.result.smsSent === 0) {
        return NextResponse.json(
          { error: 'We could not send the test just now — that one is on our side, not your phone. Try again in a few minutes.' },
          { status: 502 }
        )
      }
      await stamp({ testAlertSentAt: now })
      return NextResponse.json({
        ok: sent.ok,
        emailSent: sent.result.emailSent,
        smsSent: sent.result.smsSent,
        // The recipients' own errors are for the admin log, not the shop —
        // "it did not arrive" plus the whitelist steps is what they can act on.
      })
    }

    if (action === 'confirm-alerts') {
      await stamp({ alertsConfirmedAt: now })
      return NextResponse.json({ ok: true })
    }

    if (action === 'app-installed') {
      await stamp({ appInstalledAt: now })
      return NextResponse.json({ ok: true })
    }

    if (action === 'dismiss') {
      await stamp({ dismissedAt: now })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Portal onboarding action failed:', error)
    return NextResponse.json(
      {
        error:
          'Could not save that just now. If this is a fresh deploy, the onboarding table may not exist yet — run /api/admin/setup-db.',
      },
      { status: 503 }
    )
  }
}
