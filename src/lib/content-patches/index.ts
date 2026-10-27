import type { ContentPatch } from '@/lib/content-patch'
import { AGS_2026_10 } from '@/lib/content-patches/ags-2026-10'
import { AGS_2026_10_CITIES } from '@/lib/content-patches/ags-2026-10-cities'

/** Every reviewed patch, by id. Applied from Maintenance, dry run first. */
export const CONTENT_PATCHES: Record<string, ContentPatch> = {
  [AGS_2026_10.id]: AGS_2026_10,
  [AGS_2026_10_CITIES.id]: AGS_2026_10_CITIES,
}
