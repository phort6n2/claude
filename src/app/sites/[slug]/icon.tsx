import { renderSiteIcon } from '@/lib/site-icon'

export const runtime = 'nodejs'
export const revalidate = 3600
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

/**
 * Per-client favicon. A nested icon in this segment replaces the platform
 * icon for every page under it, so a client's browser tab shows their mark,
 * not ours.
 */
export default async function Icon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return renderSiteIcon(slug, size.width)
}
