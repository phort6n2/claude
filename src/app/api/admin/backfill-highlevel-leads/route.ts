import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { kickOffCallAnalysis } from '@/lib/call-analysis/queue'
import {
  listContactsInDateRange,
  findRecordingForContact,
  type HighLevelContact,
} from '@/lib/integrations/highlevel'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * One-shot backfill of leads for a single client by pulling their HighLevel
 * contacts directly via the v2 API. Inserts Lead rows that don't already
 * exist (dedup'd by highlevelContactId), then for phone leads pulls the most
 * recent call message and attaches its recording URL — kicking off call
 * coaching analysis if the client has it enabled.
 *
 * Live ingestion still flows through the webhook handlers; this is just a
 * gap-filler for newly-onboarded clients.
 *
 * Auth: ?secret=$CRON_SECRET. Args: ?clientId=<id>&days=<N> (default 14, max 60).
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  if (new URL(req.url).searchParams.get('secret') === secret) return true
  return false
}

function pickSource(contact: HighLevelContact): 'PHONE' | 'FORM' | 'MANUAL' {
  const src = (contact.source ?? '').toLowerCase()
  const type = (contact.type ?? '').toLowerCase()
  if (
    type === 'phone' ||
    type === 'call' ||
    src.includes('call') ||
    src.includes('phone') ||
    src.includes('inbound') ||
    src.includes('number pool')
  ) {
    return 'PHONE'
  }
  if (src.includes('manual')) return 'MANUAL'
  return 'FORM'
}

async function backfill(req: NextRequest) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  const daysParam = url.searchParams.get('days')
  const days = Math.min(60, Math.max(1, parseInt(daysParam ?? '14', 10) || 14))

  if (!clientId) {
    return NextResponse.json(
      { error: 'Missing clientId query param' },
      { status: 400 }
    )
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      highlevelLocationId: true,
      highlevelApiToken: true,
      callCoachingEnabled: true,
    },
  })

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }
  if (!client.highlevelLocationId || !client.highlevelApiToken) {
    return NextResponse.json(
      {
        error:
          'Client is missing HighLevel API credentials. Set them in the admin client edit page.',
      },
      { status: 400 }
    )
  }

  let token: string
  try {
    const decrypted = decrypt(client.highlevelApiToken)
    if (!decrypted) {
      return NextResponse.json(
        {
          error:
            'Failed to decrypt API token. Re-save the token in the admin client edit page (ENCRYPTION_KEY may have changed).',
        },
        { status: 500 }
      )
    }
    token = decrypted
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to decrypt API token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    )
  }

  const endDate = new Date()
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  let contacts: HighLevelContact[]
  try {
    contacts = await listContactsInDateRange({
      token,
      locationId: client.highlevelLocationId,
      startDate,
      endDate,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: `HighLevel contacts search failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 }
    )
  }

  // Skip contacts we've already ingested.
  const ids = contacts.map((c) => c.id).filter(Boolean)
  const existing = await prisma.lead.findMany({
    where: { clientId: client.id, highlevelContactId: { in: ids } },
    select: { highlevelContactId: true },
  })
  const known = new Set(existing.map((e) => e.highlevelContactId))

  const summary = {
    clientId: client.id,
    businessName: client.businessName,
    days,
    rangeStart: startDate.toISOString(),
    rangeEnd: endDate.toISOString(),
    contactsSeen: contacts.length,
    leadsCreated: 0,
    leadsSkipped: 0,
    phoneLeadsWithRecording: 0,
    analysesKickedOff: 0,
    errors: [] as Array<{ contactId: string; error: string }>,
  }

  for (const c of contacts) {
    if (!c.id) continue
    if (known.has(c.id)) {
      summary.leadsSkipped += 1
      continue
    }

    const source = pickSource(c)

    // Attribution: HighLevel may surface either current or last attribution.
    const attribution = c.attributionSource ?? c.lastAttributionSource ?? {}

    let gclid: string | null = attribution.gclid ?? null
    if (gclid && (gclid.includes('{{') || gclid.includes('}}'))) gclid = null

    // Build a formData blob compatible with what the webhook handler stores.
    const formData: Record<string, unknown> = {
      _backfilledFromHighLevel: true,
      contact_source: c.source ?? null,
      contact_type: c.type ?? null,
      tags: c.tags ?? [],
    }
    if (Array.isArray(c.customFields)) {
      for (const cf of c.customFields) {
        if (cf.key) formData[cf.key] = cf.value
      }
    }

    let lead
    try {
      lead = await prisma.lead.create({
        data: {
          clientId: client.id,
          email: c.email ?? null,
          phone: c.phone ?? null,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          gclid,
          utmSource: attribution.utmSource ?? null,
          utmMedium: attribution.utmMedium ?? null,
          utmCampaign: attribution.utmCampaign ?? attribution.campaign ?? null,
          utmContent: attribution.utmContent ?? null,
          utmKeyword: attribution.utmTerm ?? null,
          source,
          formData: formData as Prisma.InputJsonValue,
          formName: 'highlevel-backfill',
          highlevelContactId: c.id,
          status: 'NEW',
          createdAt: c.dateAdded ? new Date(c.dateAdded) : undefined,
        },
        select: { id: true },
      })
      summary.leadsCreated += 1
    } catch (err) {
      summary.errors.push({
        contactId: c.id,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    // For phone leads, try to find an associated call recording.
    if (source !== 'PHONE') continue
    try {
      const found = await findRecordingForContact({
        token,
        locationId: client.highlevelLocationId,
        contactId: c.id,
      })
      if (!found) continue

      await prisma.lead.update({
        where: { id: lead.id },
        data: { callRecordingUrl: found.recordingUrl },
      })
      summary.phoneLeadsWithRecording += 1

      if (client.callCoachingEnabled) {
        const analysis = await prisma.callAnalysis.create({
          data: {
            clientId: client.id,
            leadId: lead.id,
            highlevelContactId: c.id,
            recordingUrl: found.recordingUrl,
            callerPhone: c.phone ?? null,
            callDirection: 'inbound',
            status: 'PENDING',
          },
          select: { id: true },
        })
        kickOffCallAnalysis(req, analysis.id)
        summary.analysesKickedOff += 1
      }
    } catch (err) {
      summary.errors.push({
        contactId: c.id,
        error: `recording lookup: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    }
  }

  return NextResponse.json(summary)
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return backfill(request)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return backfill(request)
}
