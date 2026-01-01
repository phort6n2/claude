import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const paas = await prisma.clientPAA.findMany({
      where: {
        clientId: id,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        question: true,
        priority: true,
      },
    })

    return NextResponse.json(paas)
  } catch (error) {
    console.error('Failed to fetch PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PAAs' },
      { status: 500 }
    )
  }
}
