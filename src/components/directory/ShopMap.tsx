/**
 * Single-location map for a shop page. Uses an OpenStreetMap embed iframe — no
 * API key, no client JS, no cost — with a pin at the shop's coordinates.
 * Render only when the shop has lat/lng.
 */
export function ShopMap({
  lat,
  lng,
  name,
  className,
}: {
  lat: number
  lng: number
  name: string
  className?: string
}) {
  const d = 0.006
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
  return (
    <iframe
      src={src}
      title={`Map showing the location of ${name}`}
      loading="lazy"
      className={className}
      style={{ border: 0, width: '100%', height: '100%' }}
    />
  )
}
