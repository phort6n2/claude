import { CarFront } from 'lucide-react'
import { cn } from '@/lib/utils'

// A branded cover used when a listing has no uploaded photo. The gradient is
// chosen deterministically from the slug, so a shop looks the same everywhere it
// appears.
//
// These were six shades of blue, which on a city page meant eight photo-less
// shops rendered as eight near-identical blue rectangles — a large part of why
// the site read as monotonous. They're now eight distinct dark hues: still deep
// enough for white overlay text, but actually telling listings apart.
const GRADIENTS = [
  'from-[#0F2A44] to-[#1E4A6D]', // navy
  'from-[#12343B] to-[#1E5F63]', // teal
  'from-[#1C2B22] to-[#2F4A38]', // forest
  'from-[#33241C] to-[#5C3A24]', // umber
  'from-[#2A2438] to-[#4A3A5C]', // plum
  'from-[#3B1F2B] to-[#6B3247]', // wine
  'from-[#1E293B] to-[#334155]', // slate
  'from-[#2B2A16] to-[#54502A]', // olive
]

export function coverGradient(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

/** Pure decorative background: gradient + subtle "glass shine" lines + a faint
 * vehicle watermark. Text/badges are overlaid by the caller. */
export function ShopCover({
  slug,
  className,
  watermark = 96,
}: {
  slug: string
  className?: string
  watermark?: number
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative h-full w-full overflow-hidden bg-gradient-to-br',
        coverGradient(slug),
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, rgba(255,255,255,0.9) 0 1.5px, transparent 1.5px 24px)',
        }}
      />
      <CarFront
        className="pointer-events-none absolute -bottom-4 -right-3 text-white/10"
        width={watermark}
        height={watermark}
        strokeWidth={1}
      />
    </div>
  )
}
