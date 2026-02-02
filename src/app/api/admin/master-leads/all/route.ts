import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key')

async function verifyAuth(request: NextRequest) {
  // Check for session cookie first
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      if (payload.role === 'ADMIN' || payload.role === 'SUPER_ADMIN') {
        return { authorized: true, userId: payload.userId as string }
      }
    } catch {
      // Token invalid
    }
  }

  // Check for key param (fallback for mobile)
  const key = request.nextUrl.searchParams.get('key')
  if (key === 'glassleads2024') {
    return { authorized: true, userId: 'key-auth' }
  }

  return { authorized: false }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing date range' }, { status: 400 })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            primaryColor: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({
      leads: leads.map((lead) => ({
        id: lead.id,
        email: lead.email,
        phone: lead.phone,
        firstName: lead.firstName,
        lastName: lead.lastName,
        status: lead.status,
        source: lead.source,
        gclid: lead.gclid,
        quoteValue: lead.quoteValue,
        saleValue: lead.saleValue,
        saleDate: lead.saleDate,
        saleNotes: lead.saleNotes,
        callRecordingUrl: lead.callRecordingUrl,
        createdAt: lead.createdAt.toISOString(),
        formName: lead.formName,
        formData: lead.formData,
        enhancedConversionSent: lead.enhancedConversionSent,
        offlineConversionSent: lead.offlineConversionSent,
        client: lead.client,
      })),
    })
  } catch (error) {
    console.error('Error fetching all leads:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}
