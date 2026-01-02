import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSignedUploadUrl } from '@/lib/integrations/gcs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { filename, contentType } = body

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing filename or contentType' },
        { status: 400 }
      )
    }

    // Generate a unique filename with the content ID prefix
    const uniqueFilename = `longform-videos/${id}/${Date.now()}-${filename}`

    const { uploadUrl, publicUrl } = await getSignedUploadUrl(
      uniqueFilename,
      contentType,
      30 // 30 minutes to complete upload
    )

    return NextResponse.json({
      uploadUrl,
      publicUrl,
      filename: uniqueFilename,
    })
  } catch (error) {
    console.error('Failed to get signed upload URL:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get upload URL' },
      { status: 500 }
    )
  }
}
