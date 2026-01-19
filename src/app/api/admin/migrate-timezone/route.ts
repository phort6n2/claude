import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/admin/migrate-timezone
 *
 * Migrates all clients from Pacific Time to Mountain Time.
 * Safe to run multiple times - only updates clients still on Pacific.
 */
export async function GET(request: NextRequest) {
  try {
    // Count how many need updating
    const countBefore = await prisma.client.count({
      where: { timezone: 'America/Los_Angeles' },
    })

    if (countBefore === 0) {
      return NextResponse.json({
        success: true,
        message: 'No clients need updating - all already on Mountain Time or other timezone',
        updated: 0,
      })
    }

    // Update all clients from Pacific to Mountain Time
    const result = await prisma.client.updateMany({
      where: { timezone: 'America/Los_Angeles' },
      data: { timezone: 'America/Denver' },
    })

    return NextResponse.json({
      success: true,
      message: `Updated ${result.count} clients from Pacific Time to Mountain Time`,
      updated: result.count,
    })
  } catch (error) {
    console.error('[MigrateTimezone] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
