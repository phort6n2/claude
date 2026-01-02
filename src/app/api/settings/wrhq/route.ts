import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  getWRHQConfig,
  updateWRHQWordPress,
  updateWRHQSocialMedia,
  updateWRHQPublishing,
} from '@/lib/settings'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await getWRHQConfig()

    // Mask the password for security
    const maskedConfig = {
      ...config,
      wordpress: {
        ...config.wordpress,
        appPassword: config.wordpress.appPassword ? '••••••••' : null,
      },
    }

    return NextResponse.json(maskedConfig)
  } catch (error) {
    console.error('Failed to get WRHQ config:', error)
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { section, data } = body

    switch (section) {
      case 'wordpress':
        await updateWRHQWordPress({
          url: data.url,
          username: data.username,
          // Only update password if it's not the masked value
          appPassword: data.appPassword !== '••••••••' ? data.appPassword : undefined,
        })
        break

      case 'socialMedia':
        await updateWRHQSocialMedia({
          facebook: data.facebook,
          instagram: data.instagram,
          linkedin: data.linkedin,
          twitter: data.twitter,
          tiktok: data.tiktok,
          gbp: data.gbp,
          youtube: data.youtube,
          bluesky: data.bluesky,
          threads: data.threads,
          reddit: data.reddit,
          pinterest: data.pinterest,
          telegram: data.telegram,
          enabledPlatforms: data.enabledPlatforms,
        })
        break

      case 'publishing':
        await updateWRHQPublishing({
          preferredTime: data.preferredTime,
          timezone: data.timezone,
        })
        break

      default:
        return NextResponse.json(
          { error: 'Invalid section' },
          { status: 400 }
        )
    }

    // Return updated config
    const config = await getWRHQConfig()
    const maskedConfig = {
      ...config,
      wordpress: {
        ...config.wordpress,
        appPassword: config.wordpress.appPassword ? '••••••••' : null,
      },
    }

    return NextResponse.json(maskedConfig)
  } catch (error) {
    console.error('Failed to update WRHQ config:', error)
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    )
  }
}
