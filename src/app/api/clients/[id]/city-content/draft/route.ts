import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { draftCityCopy } from '@/lib/city-copy-writer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST — draft the copy for one city.
 *
 * Deliberately does NOT save. The draft lands in the editor for a human to
 * read, correct and then save, because the model cannot verify a claim about
 * a business it has only been described.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const city = String(body.city || '').trim()
  if (!city) return NextResponse.json({ error: 'Missing city' }, { status: 400 })

  const result = await draftCityCopy({ clientId: id, city })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ draft: result.draft })
}
