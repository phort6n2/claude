import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { fetchPAAsForLocation, formatPAAAsTemplate } from '@/lib/dataforseo'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function getDataForSEOCredentials(): Promise<{ login: string | null; password: string | null }> {
  // Check database first
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'] } },
  })

  let login: string | null = null
  let password: string | null = null

  for (const setting of settings) {
    const value = setting.encrypted ? decrypt(setting.value) : setting.value
    if (setting.key === 'DATAFORSEO_LOGIN') login = value
    if (setting.key === 'DATAFORSEO_PASSWORD') password = value
  }

  // Fall back to environment variables
  if (!login) login = process.env.DATAFORSEO_LOGIN || null
  if (!password) password = process.env.DATAFORSEO_PASSWORD || null

  return { login, password }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Check for DataForSEO credentials
    const { login, password } = await getDataForSEOCredentials()

    if (!login || !password) {
      return NextResponse.json(
        { error: 'DataForSEO API credentials not configured. Go to Settings → API to add them.' },
        { status: 500 }
      )
    }

    // Get client location and service areas
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        city: true,
        state: true,
        country: true,
        serviceAreas: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    if (!client.city || !client.state) {
      return NextResponse.json(
        { error: 'Client location (city/state) is required' },
        { status: 400 }
      )
    }

    // Fetch PAAs from DataForSEO (includes service areas for more variety)
    const result = await fetchPAAsForLocation(client.city, client.state, {
      login,
      password,
      serviceAreas: client.serviceAreas || [],
      country: client.country || 'US',
    })

    console.log('[DataForSEO] Fetch result:', {
      success: result.success,
      paaCount: result.paas?.length || 0,
      cost: result.cost,
      error: result.error,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch PAAs' },
        { status: 500 }
      )
    }

    if (result.paas.length === 0) {
      return NextResponse.json({
        success: true,
        location: `${client.city}, ${client.state}`,
        paas: [],
        cost: result.cost,
        message: 'No PAA questions found for this location. Try a different search.',
      })
    }

    // Format PAAs with {location} placeholder
    const formattedPAAs = result.paas.map(paa => ({
      original: paa.question,
      formatted: formatPAAAsTemplate(paa.question, client.city, client.state),
      answer: paa.answer,
      source: paa.source,
    }))

    // Build locations list for response (main city + all service areas)
    const searchedLocations = [client.city]
    if (client.serviceAreas && client.serviceAreas.length > 0) {
      // Add all service areas, excluding duplicates of main city
      const uniqueAreas = client.serviceAreas.filter(area =>
        area.toLowerCase() !== client.city.toLowerCase()
      )
      searchedLocations.push(...uniqueAreas)
    }

    return NextResponse.json({
      success: true,
      location: `${client.city}, ${client.state}`,
      locations: searchedLocations,
      paas: formattedPAAs,
      cost: result.cost,
    })
  } catch (error) {
    console.error('Failed to fetch PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PAAs' },
      { status: 500 }
    )
  }
}
