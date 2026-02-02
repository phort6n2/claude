import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/add-quote-value-column?key=glassleads2024
 * Adds the quoteValue column to the Lead table if it doesn't exist
 */
export async function GET(request: NextRequest) {
  // Simple key check for one-time migration
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'glassleads2024') {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  try {
    // Add the quoteValue column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quoteValue" DOUBLE PRECISION;
    `)

    return NextResponse.json({
      success: true,
      message: 'quoteValue column added successfully (or already exists)',
    })
  } catch (error) {
    console.error('Failed to add quoteValue column:', error)
    return NextResponse.json(
      { error: 'Failed to add column', details: String(error) },
      { status: 500 }
    )
  }
}
