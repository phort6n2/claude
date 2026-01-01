import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  getNextAvailableDates,
  getOccupiedDatesForMonth,
  validateScheduledDate,
  getNextAvailableDateForClient,
  getCalendarMonth,
} from '@/lib/scheduling'

/**
 * GET /api/scheduling - Get scheduling data
 * Query params:
 *   - action: 'available-dates' | 'occupied-dates' | 'calendar' | 'next-available'
 *   - clientId: optional client filter
 *   - count: number of dates to return (for available-dates)
 *   - year: year for calendar/occupied-dates
 *   - month: month for calendar/occupied-dates (1-12)
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'available-dates'
  const clientId = searchParams.get('clientId') || undefined
  const count = parseInt(searchParams.get('count') || '20')
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
  const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())

  try {
    switch (action) {
      case 'available-dates': {
        const dates = getNextAvailableDates(count)
        return NextResponse.json(
          dates.map(d => ({
            date: d.toISOString().split('T')[0],
            dayOfWeek: d.getDay(),
            dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
          }))
        )
      }

      case 'occupied-dates': {
        const occupied = await getOccupiedDatesForMonth(year, month, clientId)
        return NextResponse.json(occupied)
      }

      case 'calendar': {
        const calendarData = await getCalendarMonth(year, month, clientId)
        return NextResponse.json(calendarData)
      }

      case 'next-available': {
        if (!clientId) {
          return NextResponse.json({ error: 'clientId is required for next-available' }, { status: 400 })
        }
        const nextDate = await getNextAvailableDateForClient(clientId)
        return NextResponse.json({
          date: nextDate.toISOString().split('T')[0],
          dayOfWeek: nextDate.getDay(),
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][nextDate.getDay()],
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Scheduling API error:', error)
    return NextResponse.json({ error: 'Failed to get scheduling data' }, { status: 500 })
  }
}

/**
 * POST /api/scheduling/validate - Validate a scheduled date
 * Body: { date: string, clientId: string, excludeContentItemId?: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { date, clientId, excludeContentItemId } = body

    if (!date || !clientId) {
      return NextResponse.json({ error: 'date and clientId are required' }, { status: 400 })
    }

    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    const validationError = await validateScheduledDate(parsedDate, clientId, excludeContentItemId)

    if (validationError) {
      return NextResponse.json({ valid: false, error: validationError })
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Date validation error:', error)
    return NextResponse.json({ error: 'Failed to validate date' }, { status: 500 })
  }
}
