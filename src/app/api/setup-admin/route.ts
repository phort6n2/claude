import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/setup-admin - One-time setup endpoint to create/update admin user
 * DELETE THIS FILE AFTER USE
 */
export async function GET(request: NextRequest) {
  // Security: require a secret token
  const token = request.nextUrl.searchParams.get('token')
  if (token !== 'setup-matt-2024') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const hashedPassword = await bcrypt.hash('sandid0g', 10)

    const admin = await prisma.user.upsert({
      where: { email: 'matt.lubbes@gmail.com' },
      update: {
        password: hashedPassword,
        name: 'Matt Lubbes',
        role: 'ADMIN',
      },
      create: {
        email: 'matt.lubbes@gmail.com',
        password: hashedPassword,
        name: 'Matt Lubbes',
        role: 'ADMIN',
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Admin user created/updated',
      email: admin.email,
      note: 'DELETE the /api/setup-admin route file now!'
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json({ error: 'Failed to setup admin' }, { status: 500 })
  }
}
