import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { url, username, password, clientId } = await request.json()

    console.log('[WP Test] Request:', { url, username, hasPassword: !!password, clientId })

    if (!url || !username) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // If no password provided but clientId is, use stored credentials
    let actualPassword = password
    let passwordSource = password ? 'form' : 'none'

    if (!password && clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { wordpressAppPassword: true, businessName: true },
      })
      console.log('[WP Test] Client lookup:', {
        businessName: client?.businessName,
        hasStoredPassword: !!client?.wordpressAppPassword,
        storedPasswordPrefix: client?.wordpressAppPassword?.substring(0, 10)
      })

      if (client?.wordpressAppPassword) {
        const decrypted = decrypt(client.wordpressAppPassword)
        console.log('[WP Test] Decryption result:', {
          success: !!decrypted,
          decryptedLength: decrypted?.length
        })
        actualPassword = decrypted
        passwordSource = decrypted ? 'stored' : 'decrypt-failed'
      }
    }

    if (!actualPassword) {
      console.log('[WP Test] No password available, source:', passwordSource)
      return NextResponse.json(
        { error: `Password required - ${passwordSource === 'decrypt-failed' ? 'stored password could not be decrypted, please re-enter' : 'either enter a new password or save one first'}` },
        { status: 400 }
      )
    }

    console.log('[WP Test] Testing connection with password from:', passwordSource)

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
