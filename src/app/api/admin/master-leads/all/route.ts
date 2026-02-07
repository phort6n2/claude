import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user's email matches the allowed master leads email
  const allowedEmail = process.env.MASTER_LEADS_EMAIL

  if (!allowedEmail) {
    return NextResponse.json({ error: 'Not configured' }, { status: 403 })
  }

  if (session.user.email.toLowerCase() !== allowedEmail.toLowerCase()) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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
