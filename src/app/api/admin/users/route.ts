import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Only allow the master admin to manage users
const MASTER_ADMIN_EMAIL = process.env.MASTER_LEADS_EMAIL || 'matt.lubbes@gmail.com'

/**
 * GET /api/admin/users - List all users
 */
export async function GET() {
  const session = await auth()
  if (!session || session.user?.email !== MASTER_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(users)
}

/**
 * DELETE /api/admin/users - Delete a user by email
 */
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session || session.user?.email !== MASTER_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'Email parameter required' }, { status: 400 })
  }

  // Prevent deleting yourself
  if (email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'Cannot delete master admin account' }, { status: 400 })
  }

  try {
    const deleted = await prisma.user.delete({
      where: { email },
    })

    return NextResponse.json({ success: true, deleted: { email: deleted.email, name: deleted.name } })
  } catch (error) {
    console.error('Failed to delete user:', error)
    return NextResponse.json({ error: 'User not found or could not be deleted' }, { status: 404 })
  }
}
