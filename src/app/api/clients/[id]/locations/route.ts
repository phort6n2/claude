import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface IncomingLocation {
  id?: string
  label?: string
  streetAddress?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string | null
  hours?: string | null
  googlePlaceId?: string | null
  googleMapsUrl?: string | null
  isPrimary?: boolean
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const nullable = (v: unknown) => {
  const s = str(v)
  return s === '' ? null : s
}

/** GET /api/clients/[id]/locations — every shop, in display order. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const locations = await prisma.clientLocation.findMany({
    where: { clientId: id },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ locations })
}

/**
 * PUT /api/clients/[id]/locations — replace the shop list.
 *
 * The editor is a list the admin adds to, reorders, and deletes from, so the
 * whole set arrives at once and this route reconciles it: rows with an id are
 * updated, rows without are created, and rows no longer present are deleted.
 * Sending the set as a unit is what makes "which shop is primary" a
 * consistent question — a per-row endpoint could leave two, or none.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const incoming: IncomingLocation[] = Array.isArray(body?.locations) ? body.locations : []

  const errors: string[] = []
  const cleaned = incoming.map((row, i) => {
    const label = str(row.label)
    const streetAddress = str(row.streetAddress)
    const city = str(row.city)
    const state = str(row.state)
    const postalCode = str(row.postalCode)
    if (!label) errors.push(`Shop ${i + 1} needs a name.`)
    if (!streetAddress || !city || !state || !postalCode) {
      errors.push(`Shop ${i + 1} needs a full address — street, city, state, and ZIP.`)
    }
    return {
      id: str(row.id) || null,
      label,
      streetAddress,
      city,
      state,
      postalCode,
      country: str(row.country) || 'US',
      phone: nullable(row.phone),
      hours: nullable(row.hours),
      googlePlaceId: nullable(row.googlePlaceId),
      googleMapsUrl: nullable(row.googleMapsUrl),
      sortOrder: i,
    }
  })

  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 })

  // Exactly one primary, always: honor the flag the admin set, and fall back
  // to the first shop so the site never has to guess which one to lead with.
  const requestedPrimary = incoming.findIndex((row) => row.isPrimary)
  const primaryIndex = requestedPrimary >= 0 ? requestedPrimary : 0

  const existing = await prisma.clientLocation.findMany({
    where: { clientId: id },
    select: { id: true },
  })
  const keptIds = new Set(cleaned.map((row) => row.id).filter(Boolean) as string[])
  const removedIds = existing.map((row) => row.id).filter((rowId) => !keptIds.has(rowId))

  await prisma.$transaction(async (tx) => {
    if (removedIds.length) {
      await tx.clientLocation.deleteMany({ where: { id: { in: removedIds }, clientId: id } })
    }
    for (const [i, row] of cleaned.entries()) {
      const data = {
        label: row.label,
        streetAddress: row.streetAddress,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        country: row.country,
        phone: row.phone,
        hours: row.hours,
        googlePlaceId: row.googlePlaceId,
        googleMapsUrl: row.googleMapsUrl,
        isPrimary: i === primaryIndex,
        sortOrder: row.sortOrder,
      }
      if (row.id) {
        // clientId in the filter keeps one client's payload from touching
        // another client's row by guessing an id.
        await tx.clientLocation.updateMany({ where: { id: row.id, clientId: id }, data })
      } else {
        await tx.clientLocation.create({ data: { ...data, clientId: id } })
      }
    }
  })

  // The address is on every page of the site, not just the home page.
  revalidatePath(`/sites/${client.slug}`, 'layout')

  const locations = await prisma.clientLocation.findMany({
    where: { clientId: id },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ locations })
}
