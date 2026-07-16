import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getShopBySlug } from '@/lib/directory/data'
import { getShopPhotos } from '@/lib/directory/photos'

// Owner/agency photo upload. Gated by a shared secret so the live site can't be
// used as a free file host. Requires two env vars:
//   BLOB_READ_WRITE_TOKEN   — auto-added when you connect a Vercel Blob store
//   DIRECTORY_UPLOAD_SECRET — a secret you choose; senders pass it as a header
export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// GET ?slug=… → list a shop's current photo URLs (public images, no secret).
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') ?? ''
  if (!getShopBySlug(slug)) {
    return NextResponse.json({ error: 'Unknown shop slug' }, { status: 400 })
  }
  return NextResponse.json({ photos: await getShopPhotos(slug) })
}

export async function POST(request: Request) {
  const secret = process.env.DIRECTORY_UPLOAD_SECRET
  if (!process.env.BLOB_READ_WRITE_TOKEN || !secret) {
    return NextResponse.json(
      { error: 'Photo uploads are not configured on this deployment.' },
      { status: 503 }
    )
  }
  if (request.headers.get('x-upload-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const slug = String(form.get('slug') ?? '')
  const file = form.get('file')

  if (!getShopBySlug(slug)) {
    return NextResponse.json({ error: 'Unknown shop slug' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Only JPG, PNG, or WebP images are allowed' },
      { status: 415 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be 5 MB or smaller' }, { status: 413 })
  }

  const key = `directory/photos/${slug}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`
  const blob = await put(key, file, { access: 'public', contentType: file.type })

  return NextResponse.json({ ok: true, url: blob.url }, { status: 201 })
}
