import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; userId: string }>
}

/**
 * PATCH /api/clients/[id]/users/[userId] - Update a client user
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, userId } = await params
  const data = await request.json()

  try {
    // Verify user belongs to this client
    const existing = await prisma.clientUser.findFirst({
      where: {
        id: userId,
        clientId: id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    if (data.name !== undefined) {
      updateData.name = data.name
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive
    }

    const user = await prisma.clientUser.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Failed to update client user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/clients/[id]/users/[userId] - Delete a client user
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, userId } = await params

  try {
    // Verify user belongs to this client
    const existing = await prisma.clientUser.findFirst({
      where: {
        id: userId,
        clientId: id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await prisma.clientUser.delete({
      where: { id: userId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete client user:', error)
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    )
  }
}
