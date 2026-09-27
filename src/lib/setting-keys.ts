/**
 * The credentials the admin can manage from Settings → API keys.
 *
 * Shared by the list, save and reveal routes rather than copied into each.
 * Three separate copies of an allow-list is how a key ends up saveable but
 * not readable, or readable but never encrypted.
 */

/** Stored encrypted, and never sent to the browser by the list endpoint. */
export const SENSITIVE_KEYS = [
  'ANTHROPIC_API_KEY',
  'DEEPGRAM_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'RESEND_API_KEY',
  // Signs Resend's email.received webhook — the reports inbox. A secret: with
  // it, anybody could post a report into a client's monthly report.
  'RESEND_INBOUND_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  // Analytics + Search Console, for the portal's Traffic page. Its own token
  // because the scopes differ from the Ads one. The client id and secret are
  // OPTIONAL: left blank, the Ads OAuth client is borrowed. They exist because
  // an operator who does not know what the Ads client was — a perfectly normal
  // state for a credential entered once, months ago — could otherwise not use
  // a fresh client of their own, and the playground demands the exact pair the
  // token was minted for.
  'GOOGLE_ANALYTICS_CLIENT_ID',
  'GOOGLE_ANALYTICS_CLIENT_SECRET',
  'GOOGLE_ANALYTICS_REFRESH_TOKEN',
  'LOCALDOMINATOR_API_KEY',
] as const

/**
 * Everything manageable here. The from-address, from-number, Messaging
 * Service SID and manager customer ID are deliberately not sensitive — they
 * are shown in full so it is obvious at a glance which sender clients' alerts
 * come from, and which Ads account is being queried.
 */
export const ALL_KEYS: string[] = [
  'ANTHROPIC_API_KEY',
  // Transcription — the FIRST step of call coaching. This was read by the
  // pipeline and probed by the status page but had no field anywhere, so the
  // headline feature could not be switched on from the UI at all. Exactly the
  // failure the settings fallback exists to prevent, and the second time it
  // has happened after Local Dominator.
  'DEEPGRAM_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM',
  // The reports inbox (lib/seo-report-inbound.ts). It shipped read by the code
  // and absent from this list, so the one setting it cannot run without had no
  // field — the DEEPGRAM and Local Dominator mistake a third time.
  'RESEND_INBOUND_SECRET',
  'SEO_REPORT_SENDERS',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'TWILIO_MESSAGING_SERVICE_SID',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  // Analytics + Search Console. The client id and secret are optional —
  // blank means "reuse the Google Ads OAuth client".
  'GOOGLE_ANALYTICS_CLIENT_ID',
  'GOOGLE_ANALYTICS_CLIENT_SECRET',
  'GOOGLE_ANALYTICS_REFRESH_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'LOCALDOMINATOR_API_KEY',
  'LOCALDOMINATOR_SHARE_HOST',
]

export function isSensitiveKey(key: string): boolean {
  return (SENSITIVE_KEYS as readonly string[]).includes(key)
}
