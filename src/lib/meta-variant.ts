/**
 * Is this request the ?v=meta landing variant? One place, so the page and
 * its metadata cannot disagree about whether the page is indexed.
 */
export const META_VARIANT_PARAM = 'v'
export const META_VARIANT_VALUE = 'meta'

export function isMetaVariant(searchParams: Record<string, string | string[] | undefined> | undefined): boolean {
  const v = searchParams?.[META_VARIANT_PARAM]
  const value = Array.isArray(v) ? v[0] : v
  return (value || '').toLowerCase() === META_VARIANT_VALUE
}
