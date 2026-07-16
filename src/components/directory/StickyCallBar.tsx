import { Phone } from 'lucide-react'
import { telHref } from '@/lib/directory/format'

/**
 * Fixed bottom "Call" bar shown only on mobile. The core consumer conversion —
 * keeps the phone number one tap away no matter how far the user scrolls.
 * The shop page adds bottom padding so content isn't hidden behind it.
 */
export function StickyCallBar({ phone }: { phone: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
      <a
        href={telHref(phone)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors active:bg-blue-800"
      >
        <Phone width={18} height={18} /> Call {phone}
      </a>
    </div>
  )
}
