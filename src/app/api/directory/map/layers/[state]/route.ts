import { NextResponse } from 'next/server'
import { getStateLayers } from '@/lib/directory/map-layers'

// Reference geometry for one state, fetched when that state is opened.
//
// Kept off /api/directory/map on purpose: see the note in map-layers.ts. The
// national response stays at its current weight and only visitors who open a
// state pay for the detail.
export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ state: string }> }
) {
  const { state } = await params
  const layers = await getStateLayers(state)
  if (!layers) {
    return NextResponse.json({ error: 'unknown state' }, { status: 404 })
  }
  return NextResponse.json(layers, {
    // Immutable in practice — the geometry only changes when the generator is
    // re-run and redeployed.
    headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  })
}
