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

/**
 * The decoded-VIN line and the calibration flag, when the lead has them.
 *
 * Rendered together because they answer one question — what is this vehicle
 * and does the glass carry a camera — and the flag is meaningless without the
 * vehicle it belongs to.
 */
export function VehicleDecode({
  formData,
  className = '',
}: {
  formData: Record<string, unknown> | null | undefined
  className?: string
}) {
  const headline = typeof formData?.vin_decoded === 'string' ? formData.vin_decoded : null
  const verdict = typeof formData?.vin_calibration === 'string' ? formData.vin_calibration : null
  if (!headline) return null

  const flagged = verdict === 'likely' || verdict === 'possible'
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">
        Decoded from the VIN
      </p>
      <p
        className={`text-sm rounded-lg px-3 py-2 ${
          flagged
            ? 'bg-amber-50 border border-amber-200 text-amber-900'
            : 'bg-gray-50 border border-gray-200 text-gray-700'
        }`}
      >
        {headline}
      </p>
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

export interface LeadTextMessage {
  id: string
  direction: string
  body: string | null
  mediaUrls: string[]
  createdAt: string | Date
}

/**
 * The texts on a lead, with the photos in them.
 *
 * WHY IT IS HERE AND NOT ONLY IN THE ALERT EMAIL. The alert is the thing that
 * gets somebody to pick up the phone, and it already carries the picture. But
 * the lead is where the job is worked afterwards — the quote typed, the
 * booking marked, the value recorded — and a photo that existed only in an
 * email from three days ago is a photo nobody can find when they need it. The
 * same reason call recordings are copied and shown on the lead rather than
 * left in Twilio.
 *
 * Photos are small and clickable, like DamagePhoto above and for the same
 * reason: whoever is reading this is triaging, not admiring.
 */
export function LeadTexts({
  messages,
  className = '',
}: {
  messages: LeadTextMessage[] | null | undefined
  className?: string
}) {
  if (!messages?.length) return null
  const time = (at: string | Date) => {
    const d = at instanceof Date ? at : new Date(at)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5">
        {messages.length === 1 ? 'Text from the customer' : `${messages.length} texts`}
      </p>
      <div className="space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border px-3 py-2 ${
              m.direction === 'outbound'
                ? 'border-blue-200 bg-blue-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {m.direction === 'outbound' ? 'Sent' : 'Received'}
              </span>
              <span className="text-xs text-gray-400">{time(m.createdAt)}</span>
            </div>
            {m.body ? <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{m.body}</p> : null}
            {m.mediaUrls.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.mediaUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Sent by the customer"
                      className="h-24 w-auto max-w-full rounded-md border border-gray-200 object-cover hover:opacity-90"
                    />
                  </a>
                ))}
              </div>
            ) : null}
            {/* A text with neither words nor a readable picture is still a
                contact worth seeing — most often a video, which the browser
                will not thumbnail but the shop can still open. */}
            {!m.body && !m.mediaUrls.length ? (
              <p className="mt-1 text-sm text-gray-400">(no text or photo came through)</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
