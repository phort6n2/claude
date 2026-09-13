import { twilioCreds } from '@/lib/twilio-voice'

/**
 * Inbound texts and the photos attached to them.
 *
 * WHY THIS EXISTS AT ALL. The hosted sites say "text a photo of the damage —
 * it is the fastest way to a firm price", and a photo genuinely is the one
 * artifact that settles a quote. Until now those texts went to the shop's own
 * handset, because the tracking numbers were bought with a VoiceUrl and
 * nothing else and a text to one was swallowed silently. That meant the photo
 * never reached a lead, never reached the portal, and never counted as
 * anything — the same shape of absence the `<Dial record>` typo produced.
 *
 * TWILIO'S MEDIA URLS ARE NOT A PLACE TO KEEP A PHOTO. They need Basic auth,
 * so nothing in a browser or an email can render one, and they do not outlive
 * the message. So each is copied to Blob storage exactly as call recordings
 * are — a stored Twilio URL is a photo that works right up until it does not,
 * and by then nobody remembers why.
 */

/** Twilio accepts at most 10 media items on one message. */
const MAX_MEDIA = 10

/** What a browser and an email client will both render. */
const RENDERABLE = /^image\/(jpeg|jpg|png|gif|webp|heic|heif|avif)$/i

export interface InboundMedia {
  url: string
  contentType: string
}

/**
 * Pull the media off the form-encoded webhook body.
 *
 * Twilio numbers them `MediaUrl0`, `MediaContentType0`, and so on, and
 * `NumMedia` is a STRING. Read from NumMedia rather than probing for keys,
 * because a missing index in the middle is Twilio telling us something we
 * should not paper over.
 *
 * Pure: params in, a list out.
 */
export function mediaFromParams(params: Record<string, string>): InboundMedia[] {
  const count = Math.min(parseInt(params.NumMedia || '0', 10) || 0, MAX_MEDIA)
  const out: InboundMedia[] = []
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`]
    if (!url) continue
    out.push({ url, contentType: params[`MediaContentType${i}`] || 'application/octet-stream' })
  }
  return out
}

/** Is this something worth showing as a picture? */
export function isRenderableImage(contentType: string): boolean {
  return RENDERABLE.test((contentType || '').split(';')[0].trim())
}

/** `.jpg` from `image/jpeg`, for a stored filename that opens where it lands. */
function extensionFor(contentType: string): string {
  const type = (contentType || '').split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
  }
  return map[type] || 'bin'
}

/**
 * Copy one media item onto our own storage. Null on any failure.
 *
 * Never throws: a photo that cannot be copied must not cost the message, the
 * lead or the alert. The shop still gets told somebody texted; they simply do
 * not get the picture, and the log says why.
 */
export async function storeSmsMedia(
  media: InboundMedia,
  clientSlug: string,
  messageSid: string,
  index: number
): Promise<string | null> {
  const creds = await twilioCreds()
  if (!creds) {
    console.error('[Twilio SMS] Cannot fetch media — no credentials')
    return null
  }

  try {
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
    const res = await fetch(media.url, {
      headers: { Authorization: `Basic ${auth}` },
      // Twilio 307s a media URL to its CDN; the auth header is only needed on
      // the first hop, and fetch follows redirects by default.
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.error(`[Twilio SMS] Media fetch failed: HTTP ${res.status} for ${media.url}`)
      return null
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length) {
      console.error(`[Twilio SMS] Media came back empty for ${media.url}`)
      return null
    }

    // The content type Twilio REPORTS is what we store it as; the one the CDN
    // answers with is sometimes octet-stream, which would make an email render
    // a download link instead of a picture.
    const { put } = await import('@vercel/blob')
    const blob = await put(
      `sms/${clientSlug}/${messageSid}-${index}.${extensionFor(media.contentType)}`,
      bytes,
      { access: 'public', addRandomSuffix: true, contentType: media.contentType }
    )
    return blob.url
  } catch (error) {
    console.error('[Twilio SMS] Media copy failed:', error)
    return null
  }
}

/**
 * A message that is an opt-out rather than an enquiry.
 *
 * These words are carrier-level conventions and Twilio may handle some of
 * them for us, but a lead row and an alert for somebody typing STOP is noise
 * at best and a complaint at worst. Recognised here so the webhook can log it
 * and do nothing else.
 *
 * Deliberately exact-match on the whole message: "stop by tomorrow and I will
 * show you the crack" is an enquiry, and the most useful one of the day.
 */
const OPT_OUT = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'stop all',
  'optout',
  'opt out',
])

export function isOptOut(body: string | null | undefined): boolean {
  const text = (body || '').trim().toLowerCase().replace(/[.!]+$/, '')
  return OPT_OUT.has(text)
}
