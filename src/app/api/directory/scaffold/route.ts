import { NextResponse } from 'next/server'
import { analyzeWebsite } from '@/lib/directory/scaffold'
import { getAllShops } from '@/lib/directory/data'

// Agency tools, gated by DIRECTORY_UPLOAD_SECRET:
//   POST { url }        → auto-fill a listing draft + SEO report for one site
//   GET  ?audit=1       → rank all current listings by SEO opportunity (leads)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authed(request: Request): boolean {
  const secret = process.env.DIRECTORY_UPLOAD_SECRET
  return !!secret && request.headers.get('x-upload-secret') === secret
}

/** Block non-public / internal targets (basic SSRF guard). */
function isSafePublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return false
    return true
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const shops = getAllShops().filter((s) => s.website)
  const prospects = await Promise.all(
    shops.map(async (s) => {
      const { seo } = await analyzeWebsite(s.website as string)
      return { slug: s.slug, name: s.name, city: s.city, state: s.state, website: s.website, seo }
    })
  )
  prospects.sort((a, b) => b.seo.opportunity - a.seo.opportunity)
  return NextResponse.json({ prospects })
}

export async function POST(request: Request) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const url = String(body?.url ?? '').trim()
  if (!isSafePublicUrl(url)) {
    return NextResponse.json({ error: 'Enter a valid public http(s) URL' }, { status: 400 })
  }
  const result = await analyzeWebsite(url)
  return NextResponse.json(result)
}
