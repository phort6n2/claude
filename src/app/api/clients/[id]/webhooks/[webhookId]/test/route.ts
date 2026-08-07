import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { postToDestination } from '@/lib/webhook-forwarding'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; webhookId: string }>
}

/**
 * Send a clearly-marked test payload to a destination, synchronously, and
 * report the result. Shaped like a real form submission so a HighLevel
 * workflow keyed to those fields will accept it.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, webhookId } = await params

    const destination = await prisma.webhookDestination.findFirst({
      where: { id: webhookId, clientId: id },
      include: { client: { select: { businessName: true, slug: true } } },
    })
    if (!destination) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    const testPayload = {
      _test: true,
      first_name: 'Test',
      last_name: 'Lead',
      full_name: 'Test Lead',
      email: 'webhook-test@glassleads.app',
      phone: '+15555550100',
      contact_source: 'glassleads.app webhook test',
      message: `Test delivery from glassleads.app for ${destination.client.businessName}. Safe to ignore or delete.`,
      sent_at: new Date().toISOString(),
    }

    const result = await postToDestination(destination.url, testPayload)

    return NextResponse.json({
      success: result.ok,
      responseStatus: result.status,
      error: result.error,
    })
  } catch (error) {
    console.error('Failed to send test delivery:', error)
    return NextResponse.json(
      { error: 'Failed to send test delivery' },
      { status: 500 }
    )
  }
}
