import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPortalInvite } from '@/lib/portal-invite'
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
  if (!session?.user) {
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
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const data = await request.json()

  if (!data.email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  /* A PASSWORD IS OPTIONAL, because the portal's front door is an emailed
     sign-in link and most accounts never have one. Requiring it here meant an
     operator had to invent a password and find a way to tell the shop it —
     and a password set this way is exactly what gets typed into the STAFF
     login and rejected, which is the failure this whole path keeps producing.
     Passing one is still allowed for a shop that asks for it. */
  if (data.password && data.password.length < 6) {
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
    /* Lowercased to match what CREATE writes. Checking the raw address let
       "Owner@shop.com" past a row stored as "owner@shop.com", and the insert
       then died on the unique index as a 500 "Failed to create user" — a
       duplicate reported as a fault. */
    const existing = await prisma.clientUser.findUnique({
      where: { email: String(data.email).toLowerCase().trim() },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      )
    }

    const passwordHash = data.password ? await hashPassword(data.password) : null

    const user = await prisma.clientUser.create({
      data: {
        clientId: id,
        email: String(data.email).toLowerCase().trim(),
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

    /* CREATING AN ACCOUNT NOW TELLS THE PERSON IT EXISTS.
       This screen used to create a login and send nothing, which is a trap
       rather than a feature: the operator has made a working account, has no
       reason to think anyone still needs telling, and the shop hears nothing.
       That is exactly how a client sat locked out for days while a password
       was reset for them twice.

       The same invite the Overview card sends — a magic link, never the
       password. A password is optional here and is not something to put in an
       email; the link is the front door either way. Opt out by passing
       sendInvite: false, for pre-creating an account somebody is not ready to
       be told about. */
    let invited = false
    let inviteError: string | null = null
    if (data.sendInvite !== false) {
      const result = await sendPortalInvite(id, user.email, user.name)
      invited = result.emailed
      // Never fatal: the account exists either way, and "created but not
      // emailed, because X" is the useful thing to say. Silence is what this
      // change exists to remove.
      if (!result.emailed) inviteError = result.note || 'The invite email did not send.'
    }

    return NextResponse.json(
      { ...user, hasPassword: !!passwordHash, invited, inviteError },
      { status: 201 }
    )
  } catch (error) {
    console.error('Failed to create client user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
