import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { runContentPatch } from '@/lib/content-patch'
import { CONTENT_PATCHES } from '@/lib/content-patches'

export const dynamic = 'force-dynamic'

/**
 * POST ?id=<patch id>[&dryRun=1] — apply one reviewed content patch
 * (lib/content-patch.ts). The dry run reports every operation against what is
 * live and writes nothing; a real run refuses outright if any operation no
 * longer matches. `?dryRun=1` because the Maintenance runner sends no body.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const patch = CONTENT_PATCHES[params.get('id') || '']
  if (!patch) {
    return NextResponse.json(
      { error: `Unknown patch. Known: ${Object.keys(CONTENT_PATCHES).join(', ') || 'none'}` },
      { status: 404 }
    )
  }
  const report = await runContentPatch(patch, { dryRun: params.get('dryRun') === '1' })
  return NextResponse.json(report, { status: report.ok ? 200 : 409 })
}
