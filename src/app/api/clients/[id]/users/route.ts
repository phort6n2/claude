import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { hashPassword } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/users - List all users for a client
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const users = await prisma.clientUser.findMany({
      where: { clientId: id },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Transform to include hasPassword instead of passwordHash
    const usersWithPasswordFlag = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      hasPassword: !!user.passwordHash,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }))

    return NextResponse.json(usersWithPasswordFlag)
  } catch (error) {
    console.error('Failed to fetch client users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/clients/[id]/users - Create a new user for a client
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const data = await request.json()

  if (!data.email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (!data.password || data.password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  try {
    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if email already exists
    const existing = await prisma.clientUser.findUnique({
      where: { email: data.email },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      )
    }

    // Hash the password
    const passwordHash = await hashPassword(data.password)

    const user = await prisma.clientUser.create({
      data: {
        clientId: id,
        email: data.email.toLowerCase(),
        name: data.name || null,
        passwordHash,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ ...user, hasPassword: true }, { status: 201 })
  } catch (error) {
    console.error('Failed to create client user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
