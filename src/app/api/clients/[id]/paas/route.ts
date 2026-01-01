import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET - Get client's PAAs
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const paas = await prisma.clientPAA.findMany({
      where: { clientId: id },
      orderBy: { priority: 'asc' },
    })

    return NextResponse.json({ paas })
  } catch (error) {
    console.error('Failed to fetch client PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PAAs' },
      { status: 500 }
    )
  }
}

// POST - Save client's PAAs (replaces all existing)
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { paaText } = await request.json()

    // Parse lines
    const lines = paaText
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)

    // Validate each line
    const errors: string[] = []
    lines.forEach((line: string, index: number) => {
      if (!line.includes('{location}')) {
        errors.push(`Line ${index + 1}: Missing {location}`)
      }
      if (!line.endsWith('?')) {
        errors.push(`Line ${index + 1}: Must end with ?`)
      }
    })

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', errors },
        { status: 400 }
      )
    }

    // Delete existing PAAs for this client
    await prisma.clientPAA.deleteMany({
      where: { clientId: id },
    })

    // Create new PAAs
    const paasData = lines.map((question: string, index: number) => ({
      clientId: id,
      question: question,
      priority: index + 1,
      isActive: true,
    }))

    await prisma.clientPAA.createMany({
      data: paasData,
    })

    return NextResponse.json({
      success: true,
      count: paasData.length,
    })
  } catch (error) {
    console.error('Failed to save client PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to save PAAs' },
      { status: 500 }
    )
  }
}
