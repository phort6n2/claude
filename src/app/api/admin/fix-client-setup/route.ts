import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { assignSlotToClient } from '@/lib/automation/auto-scheduler'
import { syncStandardPAAsToClient } from '@/lib/automation/paa-selector'

/**
 * GET /api/admin/fix-client-setup
 *
 * Fixes clients that are missing:
 * - Publishing schedule (scheduleDayPair, scheduleTimeSlot)
 * - Standard PAAs
 *
 * Safe to run multiple times - only fixes what's missing.
 */
export async function GET(request: NextRequest) {
  try {
    const results = {
      clientsChecked: 0,
      schedulesAssigned: [] as string[],
      paaSynced: [] as { clientName: string; count: number }[],
      errors: [] as string[],
    }

    // Get all active clients
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        businessName: true,
        scheduleDayPair: true,
        scheduleTimeSlot: true,
      },
    })

    results.clientsChecked = clients.length

    for (const client of clients) {
      // Check if client needs schedule assignment
      if (!client.scheduleDayPair || client.scheduleTimeSlot === null) {
        try {
          const slot = await assignSlotToClient(client.id)
          results.schedulesAssigned.push(
            `${client.businessName}: ${slot.dayPair} slot ${slot.timeSlot}`
          )
        } catch (err) {
          results.errors.push(`Schedule for ${client.businessName}: ${err}`)
        }
      }

      // Sync standard PAAs (will skip if already synced)
      try {
        const syncedCount = await syncStandardPAAsToClient(client.id)
        if (syncedCount > 0) {
          results.paaSynced.push({
            clientName: client.businessName,
            count: syncedCount,
          })
        }
      } catch (err) {
        results.errors.push(`PAAs for ${client.businessName}: ${err}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Checked ${results.clientsChecked} clients`,
      results,
    })
  } catch (error) {
    console.error('[FixClientSetup] Error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
