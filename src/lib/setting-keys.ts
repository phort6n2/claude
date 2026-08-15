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
  'GOOGLE_PLACES_API_KEY',
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
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
  'GOOGLE_PLACES_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'TWILIO_MESSAGING_SERVICE_SID',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'LOCALDOMINATOR_API_KEY',
]

export function isSensitiveKey(key: string): boolean {
  return (SENSITIVE_KEYS as readonly string[]).includes(key)
}
