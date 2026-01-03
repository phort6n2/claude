import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSetting, setSetting } from '@/lib/settings'

// Route segment config for App Router
export const maxDuration = 60 // 60 seconds per chunk

interface RouteContext {
  params: Promise<{ id: string }>
}

interface UploadSession {
  uploadUrl: string
  fileSize: number
  bytesUploaded: number
  contentId: string
  title: string
  description: string
  playlistId?: string
  thumbnailUrl?: string
  createdAt: number
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Get upload session from Settings
    const sessionJson = await getSetting(`youtube_upload_session_${id}`)
    if (!sessionJson) {
      return NextResponse.json(
        { error: 'Upload session not found. Please restart the upload.' },
        { status: 400 }
      )
    }

    const uploadSession: UploadSession = JSON.parse(sessionJson)

    // Get chunk info from headers
    const contentRange = request.headers.get('content-range')
    const contentLength = request.headers.get('content-length')

    if (!contentRange || !contentLength) {
      return NextResponse.json(
        { error: 'Missing Content-Range or Content-Length header' },
        { status: 400 }
      )
    }

    // Parse Content-Range: bytes start-end/total
    const rangeMatch = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/)
    if (!rangeMatch) {
      return NextResponse.json(
        { error: 'Invalid Content-Range format' },
        { status: 400 }
      )
    }

    const [, startStr, endStr, totalStr] = rangeMatch
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    const total = parseInt(totalStr, 10)

    // Read the chunk
    const chunkBuffer = await request.arrayBuffer()
    const chunkSize = chunkBuffer.byteLength

    console.log('Uploading chunk to YouTube:', {
      contentId: id,
      start,
      end,
      total,
      chunkSize,
    })

    // Forward to YouTube's resumable upload
    const youtubeResponse = await fetch(uploadSession.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
        'Content-Length': chunkSize.toString(),
        'Content-Range': contentRange,
      },
      body: chunkBuffer,
    })

    // Check response status
    // 308 Resume Incomplete = chunk received, more chunks expected
    // 200/201 = upload complete
    // Other = error

    if (youtubeResponse.status === 308) {
      // Chunk received, update progress
      const range = youtubeResponse.headers.get('range')
      let bytesUploaded = end + 1

      if (range) {
        const rangeEndMatch = range.match(/bytes=0-(\d+)/)
        if (rangeEndMatch) {
          bytesUploaded = parseInt(rangeEndMatch[1], 10) + 1
        }
      }

      // Update session
      uploadSession.bytesUploaded = bytesUploaded
      await setSetting(`youtube_upload_session_${id}`, JSON.stringify(uploadSession))

      return NextResponse.json({
        success: true,
        complete: false,
        bytesUploaded,
        totalBytes: total,
        progress: Math.round((bytesUploaded / total) * 100),
      })
    } else if (youtubeResponse.status === 200 || youtubeResponse.status === 201) {
      // Upload complete!
      const videoData = await youtubeResponse.json()
      const videoId = videoData.id

      console.log('YouTube upload complete:', videoId)

      // Clean up session
      await setSetting(`youtube_upload_session_${id}`, '')

      return NextResponse.json({
        success: true,
        complete: true,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        // Include session data for finalization
        playlistId: uploadSession.playlistId,
        thumbnailUrl: uploadSession.thumbnailUrl,
        title: uploadSession.title,
        description: uploadSession.description,
      })
    } else {
      // Error
      const error = await youtubeResponse.text()
      console.error('YouTube chunk upload failed:', youtubeResponse.status, error)
      return NextResponse.json(
        { error: `YouTube upload failed (${youtubeResponse.status}): ${error}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Chunk upload failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chunk upload failed' },
      { status: 500 }
    )
  }
}
