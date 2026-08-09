import { renderSiteIcon } from '@/lib/site-icon'

export const runtime = 'nodejs'
export const revalidate = 3600
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Home-screen icon for the client's site. Without this the root
 * apple-touch-icon leaks through and iOS bookmarks show our mark on their
 * site.
 */
export default async function AppleIcon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return renderSiteIcon(slug, size.width)
}
