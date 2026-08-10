import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Every lead for one client, as CSV.
 *
 * Written for the delete flow, which otherwise destroys years of contact
 * history with nothing to fall back on. It is useful on its own too — a
 * client who leaves is entitled to ask for their leads, and "we deleted them"
 * is a bad answer to give someone who might come back.
 */

/** RFC 4180: quote everything, double any embedded quotes. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""'
  const s = value instanceof Date ? value.toISOString() : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * Pull one value out of the captured form payload.
 *
 * Vehicle, service and ZIP live in formData rather than in columns, and the
 * widget and HighLevel spell their keys differently, so each is tried in turn
 * rather than assuming one shape.
 */
function field(formData: unknown, kind: 'vehicle' | 'service' | 'zip'): string {
  if (!formData || typeof formData !== 'object') return ''
  const data = formData as Record<string, unknown>
  const keys = {
    vehicle: ['vehicle', 'vehicle_info', 'vehicleInfo', 'year_make_model'],
    service: ['service_label', 'service', 'serviceLabel', 'interested_in'],
    zip: ['postal_code', 'zip', 'postalCode', 'zipcode'],
  }[kind]
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { slug: true, businessName: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const leads = await prisma.lead.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      status: true,
      source: true,
      saleValue: true,
      saleDate: true,
      saleNotes: true,
      quoteValue: true,
      formName: true,
      formData: true,
      landingPageUrl: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      gclid: true,
    },
  })

  const headers = [
    'Created', 'First name', 'Last name', 'Phone', 'Email', 'Status', 'Source',
    'Sale value', 'Sale date', 'Sale notes', 'Quote value', 'Form', 'Vehicle',
    'Service', 'ZIP', 'Landing page', 'UTM source', 'UTM medium',
    'UTM campaign', 'GCLID',
  ]

  const rows = leads.map((l) =>
    [
      l.createdAt, l.firstName, l.lastName, l.phone, l.email, l.status, l.source,
      l.saleValue, l.saleDate, l.saleNotes, l.quoteValue, l.formName,
      field(l.formData, 'vehicle'), field(l.formData, 'service'), field(l.formData, 'zip'),
      l.landingPageUrl, l.utmSource, l.utmMedium, l.utmCampaign, l.gclid,
    ].map(cell).join(',')
  )

  // BOM so Excel opens UTF-8 correctly — without it, accented names arrive
  // mangled, and this is exactly the file someone opens in Excel.
  const csv = `﻿${headers.map(cell).join(',')}\n${rows.join('\n')}\n`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${client.slug}-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
