'use client'

/**
 * The customer's photo of their damage, on a lead.
 *
 * Rendered small and clickable rather than full width. Whoever is looking at
 * this is triaging a list, and a photo big enough to push the phone number
 * off the screen makes the lead slower to act on, not faster.
 *
 * The URL is validated at the webhook — only our own storage under the damage
 * prefix reaches the database — so nothing here has to guard against being
 * pointed somewhere else.
 */
export function DamagePhoto({ url, className = '' }: { url: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5">
        Photo from the customer
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Damage sent by the customer"
          className="h-28 w-auto max-w-full rounded-lg border border-gray-200 object-cover hover:opacity-90"
        />
      </a>
    </div>
  )
}

/** Pull the stored photo off a lead's form data, if it has one. */
export function damagePhotoOf(formData: Record<string, unknown> | null | undefined): string | null {
  if (!formData) return null
  const direct = formData.damage_photo_url
  if (typeof direct === 'string' && direct) return direct
  const raw = formData._rawPayload as Record<string, unknown> | undefined
  const nested = raw?.damage_photo_url
  return typeof nested === 'string' && nested ? nested : null
}
