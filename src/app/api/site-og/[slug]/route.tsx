import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { sitePaletteVars } from '@/lib/site-theme'

export const runtime = 'nodejs'
export const revalidate = 3600

/**
 * Social share card for a client's hosted site — their brand color, their
 * name, and (only when live data exists) their Google rating. Referenced by
 * absolute URL from page metadata so it works on custom domains and
 * subdomains alike.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const client = await prisma.client.findFirst({
    where: { OR: [{ slug }, { siteSubdomain: slug }] },
    select: {
      businessName: true,
      city: true,
      state: true,
      phone: true,
      primaryColor: true,
      accentColor: true,
      offersMobileService: true,
      offersAdasCalibration: true,
    },
  })

  if (!client) {
    return new Response('Not found', { status: 404 })
  }

  const reviews = await prisma.clientGbpReviews
    .findFirst({ where: { client: { OR: [{ slug }, { siteSubdomain: slug }] } } })
    .catch(() => null)

  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const brand = palette['--cta']
  const dark = palette['--dark']

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: dark,
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#ffffff',
              opacity: 0.75,
              fontWeight: 700,
            }}
          >
            {client.city}, {client.state} auto glass
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 74,
              lineHeight: 1.05,
              fontWeight: 800,
              color: '#ffffff',
              marginTop: 18,
            }}
          >
            {client.businessName}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
            {[
              client.offersMobileService ? 'Mobile service' : 'Local shop',
              client.offersAdasCalibration ? 'ADAS calibration' : 'Windshield repair',
              'Insurance claims',
            ].map((chip) => (
              <div
                key={chip}
                style={{
                  display: 'flex',
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  fontSize: 24,
                  fontWeight: 600,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: brand,
              color: '#ffffff',
              fontSize: 34,
              fontWeight: 800,
              padding: '18px 34px',
              borderRadius: 16,
            }}
          >
            {client.phone}
          </div>
          {reviews && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Drawn, not typed — the renderer's default font has no ★ glyph
                  and falls back to a tofu box. */}
              <svg width="46" height="46" viewBox="0 0 24 24" fill="#F5A524">
                <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, color: '#fff' }}>
                  {reviews.rating.toFixed(1)}
                </div>
                <div style={{ display: 'flex', fontSize: 20, color: '#fff', opacity: 0.75 }}>
                  {reviews.reviewCount} Google reviews
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
