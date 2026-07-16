import { CarFront } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shop imagery with a graceful, on-brand fallback. Owner-uploaded photos
 * (claimed listings) render as a real image; otherwise a clean gradient
 * placeholder keeps cards and pages from looking empty. Uses a plain <img>
 * so no remote-domain config is needed.
 */
export function ShopPhoto({
  src,
  alt,
  className,
  iconSize = 40,
}: {
  src?: string
  alt: string
  className?: string
  iconSize?: number
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={cn('h-full w-full object-cover', className)} />
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100',
        className
      )}
    >
      <CarFront width={iconSize} height={iconSize} className="text-blue-200" strokeWidth={1.5} />
    </div>
  )
}
