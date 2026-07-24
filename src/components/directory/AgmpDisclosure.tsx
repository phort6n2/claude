import { AGMP_SITE_URL } from '@/lib/directory/agmp'

/**
 * Transparent supply-side disclosure. Shown ONLY on shop-owner-facing surfaces
 * (claim, for-shops, owner dashboard) — never on consumer pages. This audience
 * is skeptical about "who's really behind this," so naming AGMP at the moment
 * they're deciding to spend builds trust rather than eroding it.
 */
export function AgmpDisclosure({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-gray-500 ${className}`}>
      Windshield Repair HQ&apos;s growth services are powered by{' '}
      <a
        href={AGMP_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-gray-600 underline hover:text-blue-600"
      >
        Auto Glass Marketing Pros
      </a>
      {' '}— the marketing agency built only for auto glass shops.
    </p>
  )
}
