import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { surfaceFromPixels, type SurfaceReading } from '@/lib/logo-surface'
import { isChromatic, type LogoColors } from '@/lib/brand-colors'

/**
 * Read a logo file and say which background it was drawn for. See
 * logo-surface.ts for the rule; this is only the decoding.
 *
 * Downscaled first: the verdict is a share of pixels, which a 160px copy
 * answers as well as the original, and a 2000px logo decoded to raw RGBA is
 * 16MB of work for no better answer.
 */
export async function readLogoSurface(file: Buffer): Promise<SurfaceReading | null> {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return surfaceFromPixels(new Uint8Array(data), info.width, info.height)
}

/**
 * Measure the client's CURRENT header logo and store the verdict against the
 * address it was taken from. Safe to call after any write to `logoUrl`, and
 * cheap to call when nothing changed: it returns early when the stored
 * reading already belongs to this file.
 *
 * Never throws. The logo is already saved by the time this runs, and a logo
 * save must not fail because its header colour could not be worked out — the
 * header simply stays white, as it always was.
 */
export async function ensureLogoSurface(
  clientId: string,
  { force = false }: { force?: boolean } = {}
): Promise<{ surface: SurfaceReading['surface'] | null; measured: boolean; error?: string }> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { logoUrl: true, logoSurface: true, logoSurfaceUrl: true },
    })
    if (!client) return { surface: null, measured: false, error: 'client not found' }
    if (!client.logoUrl) {
      if (client.logoSurface || client.logoSurfaceUrl) {
        await prisma.client.update({
          where: { id: clientId },
          data: { logoSurface: null, logoSurfaceUrl: null },
        })
      }
      return { surface: null, measured: false }
    }
    if (!force && client.logoSurfaceUrl === client.logoUrl) {
      return { surface: (client.logoSurface as SurfaceReading['surface']) ?? null, measured: false }
    }

    const res = await fetch(client.logoUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { surface: null, measured: false, error: `logo answered HTTP ${res.status}` }
    const file = Buffer.from(await res.arrayBuffer())
    if (file.byteLength > 8_000_000) return { surface: null, measured: false, error: 'logo file too large' }

    const reading = await readLogoSurface(file)
    await prisma.client.update({
      where: { id: clientId },
      // A file with nothing to judge is stored as 'light' against its
      // address, so it is not re-fetched on every sweep for ever.
      data: { logoSurface: reading?.surface ?? 'light', logoSurfaceUrl: client.logoUrl },
    })
    return { surface: reading?.surface ?? 'light', measured: true }
  } catch (err) {
    console.warn('[LogoSurface] could not measure logo:', err)
    return { surface: null, measured: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface LogoSurfaceSweepRow {
  clientId: string
  businessName: string
  surface: SurfaceReading['surface'] | null
  measured: boolean
  error?: string
}

/**
 * Measure every logo whose stored reading is missing or belongs to an older
 * file. The self-heal for the paths that write `logoUrl` without passing
 * through a route that measures it — the importer, photo mirroring, the logo
 * re-tidy — and the backfill for every logo saved before this existed.
 *
 * `dryRun` names who WOULD be measured and fetches nothing. Measuring changes
 * what a live header looks like, so it revalidates the site it changed.
 */
export async function measureStaleLogos({
  dryRun = false,
  force = false,
}: { dryRun?: boolean; force?: boolean } = {}): Promise<LogoSurfaceSweepRow[]> {
  const clients = await prisma.client.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, slug: true, businessName: true, logoUrl: true, logoSurface: true, logoSurfaceUrl: true },
    orderBy: { businessName: 'asc' },
  })
  const rows: LogoSurfaceSweepRow[] = []
  for (const c of clients) {
    if (!force && c.logoSurfaceUrl === c.logoUrl) continue
    if (dryRun) {
      rows.push({ clientId: c.id, businessName: c.businessName, surface: null, measured: false })
      continue
    }
    const result = await ensureLogoSurface(c.id, { force })
    if (result.measured && result.surface !== c.logoSurface) {
      try {
        const { revalidatePath } = await import('next/cache')
        revalidatePath(`/sites/${c.slug}`, 'layout')
      } catch {
        // Outside a request (a script): nothing to revalidate.
      }
    }
    rows.push({ clientId: c.id, businessName: c.businessName, ...result })
  }
  return rows
}

/**
 * The colours a logo is drawn in, for reading a shop's brand off its website
 * (lib/brand-colors.ts): chromatic pixels only, bucketed, with each colour's
 * share of the logo's visible ink. The logo is the brand by definition, so a
 * page colour it agrees with is the shop's rather than a plugin's.
 */
export async function readLogoColors(file: Buffer): Promise<LogoColors> {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = new Uint8Array(data)
  const total = info.width * info.height
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
  let visible = 0
  for (let p = 0; p < total; p++) {
    const i = p * 4
    if (px[i + 3] < 128) continue
    visible++
    const c = { r: px[i], g: px[i + 1], b: px[i + 2] }
    if (!isChromatic(c)) continue
    // 24-step buckets: anti-aliased edges and JPEG noise land with their fill.
    const key = [c.r, c.g, c.b].map((v) => Math.floor(v / 24)).join(',')
    const cur = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 }
    cur.r += c.r
    cur.g += c.g
    cur.b += c.b
    cur.n++
    buckets.set(key, cur)
  }
  const colors = visible
    ? [...buckets.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map((b) => ({ color: { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n }, share: b.n / visible }))
    : []
  return { colors, surface: surfaceFromPixels(px, info.width, info.height)?.surface ?? null }
}
