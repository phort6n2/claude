/**
 * Single-location map for a shop page. Uses Google Maps' keyless embed
 * (`?output=embed`) — no API key, no cost — driven by the business name +
 * address, so Google pins the actual business (and surfaces its Google
 * presence). Reliable in production, unlike raw OpenStreetMap embeds.
 */
export function ShopMap({
  query,
  name,
  className,
}: {
  query: string
  name: string
  className?: string
}) {
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`
  return (
    <iframe
      src={src}
      title={`Map showing the location of ${name}`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className={className}
      style={{ border: 0, width: '100%', height: '100%' }}
    />
  )
}
