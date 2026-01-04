import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchPAAsForLocation, formatPAAAsTemplate } from '@/lib/dataforseo'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Check for DataForSEO credentials
    const login = process.env.DATAFORSEO_LOGIN
    const password = process.env.DATAFORSEO_PASSWORD

    if (!login || !password) {
      return NextResponse.json(
        { error: 'DataForSEO API credentials not configured' },
        { status: 500 }
      )
    }

    // Get client location
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        city: true,
        state: true,
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

    // Fetch PAAs from DataForSEO
    const result = await fetchPAAsForLocation(client.city, client.state, {
      login,
      password,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch PAAs' },
        { status: 500 }
      )
    }

    // Format PAAs with {location} placeholder
    const formattedPAAs = result.paas.map(paa => ({
      original: paa.question,
      formatted: formatPAAAsTemplate(paa.question, client.city, client.state),
      answer: paa.answer,
      source: paa.source,
    }))

    return NextResponse.json({
      success: true,
      location: `${client.city}, ${client.state}`,
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
