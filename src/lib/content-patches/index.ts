import type { ContentPatch } from '@/lib/content-patch'
import { AGS_2026_10 } from '@/lib/content-patches/ags-2026-10'
import { AGS_2026_10_REPLACEMENT_ONLY } from '@/lib/content-patches/ags-2026-10-replacement-only'
import { AGS_2026_10_ICBC } from '@/lib/content-patches/ags-2026-10-icbc'
import { SPEEDY_2026_10_LOCATIONS } from '@/lib/content-patches/speedy-2026-10-locations'

/** Every reviewed patch, by id. Applied from Maintenance, dry run first. */
export const CONTENT_PATCHES: Record<string, ContentPatch> = {
  [AGS_2026_10.id]: AGS_2026_10,
  [AGS_2026_10_REPLACEMENT_ONLY.id]: AGS_2026_10_REPLACEMENT_ONLY,
  [AGS_2026_10_ICBC.id]: AGS_2026_10_ICBC,
  [SPEEDY_2026_10_LOCATIONS.id]: SPEEDY_2026_10_LOCATIONS,
}
