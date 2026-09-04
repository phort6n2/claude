import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { siteSitemap } from '@/lib/site-sitemap'

export const dynamic = 'force-dynamic'

/**
 * GET — every page this client's hosted site publishes, and the ones it
 * serves but deliberately leaves out of the sitemap.
 *
 * Built from the same function /sitemap.xml renders, so this cannot report a
 * page the crawler is not being told about, or miss one it is.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  return NextResponse.json(await siteSitemap(id))
}
