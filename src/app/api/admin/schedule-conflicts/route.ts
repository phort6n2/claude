import { NextResponse } from 'next/server'
import {
  detectScheduleConflicts,
  fixAllConflicts,
} from '@/lib/automation/auto-scheduler'

/**
 * GET /api/admin/schedule-conflicts
 *
 * Detects scheduling conflicts where multiple clients would post at the same day+time.
 * This can happen when different day pairs share a day (e.g., MON_WED and WED_FRI both have Wednesday).
 */
export async function GET() {
  try {
    const conflicts = await detectScheduleConflicts()

    return NextResponse.json({
      success: true,
      conflictCount: conflicts.length,
      conflicts: conflicts.map(c => ({
        day: c.dayName,
        time: c.timeLabel,
        clientCount: c.clients.length,
        clients: c.clients.map(client => ({
          id: client.id,
          name: client.businessName,
          schedule: client.dayPairLabel,
        })),
      })),
    })
  } catch (error) {
    console.error('[ScheduleConflicts] Error detecting conflicts:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/schedule-conflicts
 *
 * Fixes all detected scheduling conflicts by reassigning conflicting clients to new slots.
 * For each conflict, the first client keeps their slot and others are reassigned.
 */
export async function POST() {
  try {
    const result = await fixAllConflicts()

    return NextResponse.json({
      success: true,
      message: result.conflictsFound === 0
        ? 'No conflicts found'
        : `Fixed ${result.conflictsFound} conflicts, reassigned ${result.clientsReassigned} clients`,
      ...result,
    })
  } catch (error) {
    console.error('[ScheduleConflicts] Error fixing conflicts:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
