import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { url, username, password, clientId } = await request.json()

    if (!url || !username) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // If no password provided but clientId is, use stored credentials
    let actualPassword = password
    if (!password && clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { wordpressAppPassword: true },
      })
      if (client?.wordpressAppPassword) {
        actualPassword = decrypt(client.wordpressAppPassword)
      }
    }

    if (!actualPassword) {
      return NextResponse.json(
        { error: 'Password required - either enter a new password or save one first' },
        { status: 400 }
      )
    }

    // Test connection to WordPress REST API
    const credentials = Buffer.from(`${username}:${actualPassword}`).toString('base64')

    const response = await fetch(`${url}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    })

    if (response.ok) {
      const user = await response.json()

      // Update client's wordpressConnected status if clientId provided
      if (clientId) {
        await prisma.client.update({
          where: { id: clientId },
          data: { wordpressConnected: true },
        })
      }

      return NextResponse.json({
        success: true,
        user: {
          name: user.name,
          email: user.email,
        },
      })
    } else {
      // Update client's wordpressConnected status to false if clientId provided
      if (clientId) {
        await prisma.client.update({
          where: { id: clientId },
          data: { wordpressConnected: false },
        })
      }

      const error = await response.text()
      return NextResponse.json(
        { error: 'Connection failed', details: error },
        { status: 400 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Connection failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
