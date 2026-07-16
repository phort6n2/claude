import { CarFront } from 'lucide-react'
import { cn } from '@/lib/utils'

// A branded, auto-glass-themed cover used when a listing has no uploaded photo.
// The gradient is chosen deterministically from the slug, so every shop looks
// distinct yet cohesive — and the whole set stays on-brand (blue/teal family).
const GRADIENTS = [
  'from-blue-600 to-indigo-800',
  'from-sky-600 to-blue-800',
  'from-cyan-700 to-blue-800',
  'from-indigo-600 to-blue-900',
  'from-slate-700 to-blue-900',
  'from-teal-700 to-cyan-900',
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
