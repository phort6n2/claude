/**
 * The map that sits under a rank heatmap.
 *
 * A geogrid without geography is much less useful than it looks: "weak in
 * the upper-left" is not a conversation, but "weak in Highlands Ranch" is.
 * The scan payload carries no per-point coordinates — it does not need to,
 * because we supply the scan parameters, so every pin's true position is
 * arithmetic from the centre, the spacing and the grid size.
 */

/** Metres per degree of latitude. Good to well under a metre at this scale. */
const M_PER_DEG_LAT = 111_320

/**
 * Longitude degrees shrink with latitude, so a fixed metre spacing is a
 * different number of degrees east–west than north–south. Skipping the
 * cosine puts every pin in the wrong place, and worse, wrongly in a way that
 * looks fine until someone who knows the town looks at it.
 */
function degPerMetreLng(latitude: number): number {
  return 1 / (M_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180))
}

export interface GridGeometry {
  latitude: number
  longitude: number
  /** Metres between adjacent pins. */
  distance: number
  /** Points per side. */
  gridSize: number
}

/** Coordinate of one grid point, row/col counted from the top-left. */
export function pointAt(geo: GridGeometry, row: number, col: number): { lat: number; lng: number } {
  const half = (geo.gridSize - 1) / 2
  // Rows run north → south on screen, so the offset is negated.
  const northMetres = (half - row) * geo.distance
  const eastMetres = (col - half) * geo.distance
  return {
    lat: geo.latitude + northMetres / M_PER_DEG_LAT,
    lng: geo.longitude + eastMetres * degPerMetreLng(geo.latitude),
  }
}

/** South-west and north-east corners of the whole grid. */
export function gridBounds(geo: GridGeometry): { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } } {
  const last = geo.gridSize - 1
  const sw = pointAt(geo, last, 0)
  const ne = pointAt(geo, 0, last)
  return { sw, ne }
}

/**
 * Static Maps URL fitted to the grid.
 *
 * `visible` lets Google choose the zoom that contains both corners, which is
 * exactly right and avoids computing a zoom level by hand. The styling
 * strips points of interest and drains most of the colour: the map is
 * context, and the only thing on this image that should compete for
 * attention is the ranking colour sitting on top of it.
 *
 * A small margin is added so edge pins are not clipped by the frame.
 */
export function staticMapUrl(geo: GridGeometry, apiKey: string, size = 640): string {
  const { sw, ne } = gridBounds(geo)
  const padLat = (ne.lat - sw.lat) * 0.06
  const padLng = (ne.lng - sw.lng) * 0.06
  const visible = [
    `${(sw.lat - padLat).toFixed(6)},${(sw.lng - padLng).toFixed(6)}`,
    `${(ne.lat + padLat).toFixed(6)},${(ne.lng + padLng).toFixed(6)}`,
  ].join('|')

  const styles = [
    'feature:poi|visibility:off',
    'feature:transit|visibility:off',
    'feature:administrative|element:labels|visibility:on',
    'element:labels.icon|visibility:off',
    'saturation:-70',
    'lightness:10',
  ]

  const params = new URLSearchParams({
    size: `${size}x${size}`,
    scale: '2',
    maptype: 'roadmap',
    visible,
    key: apiKey,
  })
  for (const s of styles) params.append('style', s)
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
}
