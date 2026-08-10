import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Live health for every outside service the platform depends on.
 *
 * The old version of this page tested three keys — Anthropic, Deepgram,
 * Places — which was the whole integration surface when it was written and is
 * now less than a third of it. A status page that omits the things most
 * likely to be broken is worse than none, because it is reassuring.
 *
 * So each check states what STOPS when that service is down, in terms of the
 * product rather than the vendor. "Resend: error" tells you nothing at 7am;
 * "lead alert emails are not being delivered" tells you whether to care.
 *
 * Severity is about blast radius, not about how the request failed:
 *   critical — leads are being lost or the sites are down
 *   degraded — a feature is off; leads still arrive and sites still serve
 *   optional — only used during setup, or not configured on purpose
 */

export type Severity = 'critical' | 'degraded' | 'optional'

export interface IntegrationCheck {
  id: string
  name: string
  /** What this powers. */
  purpose: string
  /** What breaks while it is down. */
  impact: string
  severity: Severity
  configured: boolean
  ok: boolean
  message: string
  /** Where to fix it. */
  href?: string
}

async function secret(key: string): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key } })
    if (setting) {
      if (setting.encrypted) {
        try {
          return decrypt(setting.value)
        } catch {
          return null
        }
      }
      return setting.value
    }
  } catch {
    // fall through to env
  }
  return process.env[key] || null
}

const SETTINGS = '/admin/settings/api'
const timeout = (ms = 10_000) => AbortSignal.timeout(ms)

/** Wrap a probe so one dead vendor can never take down the status page. */
async function probe(fn: () => Promise<{ ok: boolean; message: string }>) {
  try {
    return await fn()
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Request failed' }
  }
}

export async function runIntegrationChecks(): Promise<IntegrationCheck[]> {
  const [anthropic, deepgram, places, resendKey, twilioSid, twilioToken, blobToken] =
    await Promise.all([
      secret('ANTHROPIC_API_KEY'),
      secret('DEEPGRAM_API_KEY'),
      secret('GOOGLE_PLACES_API_KEY'),
      secret('RESEND_API_KEY'),
      secret('TWILIO_ACCOUNT_SID'),
      secret('TWILIO_AUTH_TOKEN'),
      secret('BLOB_READ_WRITE_TOKEN'),
    ])

  const checks: IntegrationCheck[] = []
  const push = (
    c: Omit<IntegrationCheck, 'ok' | 'message' | 'configured'> & {
      configured: boolean
      result?: { ok: boolean; message: string }
      /** Said instead of a bare "Not configured" when the credential is absent. */
      missing?: string
    }
  ) => {
    const { result, missing, ...rest } = c
    checks.push({
      ...rest,
      ok: !!result?.ok,
      message: result?.message ?? missing ?? 'Not configured',
    })
  }

  // ---- Database: everything else is moot if this is down ----
  push({
    id: 'database',
    name: 'Database',
    purpose: 'Every lead, client and setting',
    impact: 'Leads cannot be saved and no site will render.',
    severity: 'critical',
    configured: true,
    result: await probe(async () => {
      const started = Date.now()
      await prisma.$queryRaw`SELECT 1`
      return { ok: true, message: `Responding in ${Date.now() - started}ms` }
    }),
  })

  // ---- Lead capture and delivery ----
  push({
    id: 'resend',
    name: 'Resend',
    purpose: 'Lead alert emails',
    impact: 'Leads are still captured, but nobody is emailed about them.',
    severity: 'critical',
    configured: !!resendKey,
    href: SETTINGS,
    result: resendKey
      ? await probe(async () => {
          const res = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${resendKey}` },
            signal: timeout(),
          })
          if (res.status === 401) return { ok: false, message: 'API key rejected' }
          if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
          const data = await res.json()
          const domains: Array<{ name: string; status: string }> = data.data || []
          const verified = domains.filter((d) => d.status === 'verified')
          if (domains.length === 0) {
            return { ok: false, message: 'Connected, but no sending domain has been added.' }
          }
          if (verified.length === 0) {
            return {
              ok: false,
              message: `No verified domain (${domains.map((d) => `${d.name}: ${d.status}`).join(', ')}). Nothing will send until DNS verifies.`,
            }
          }
          return { ok: true, message: `Sending from ${verified.map((d) => d.name).join(', ')}` }
        })
      : undefined,
  })

  push({
    id: 'twilio',
    name: 'Twilio',
    purpose: 'Lead alert texts (the paid add-on)',
    impact: 'SMS alerts stop. Clients paying for them get nothing.',
    severity: 'degraded',
    configured: !!(twilioSid && twilioToken),
    href: SETTINGS,
    result:
      twilioSid && twilioToken
        ? await probe(async () => {
            const res = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}.json`,
              {
                headers: {
                  Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
                },
                signal: timeout(),
              }
            )
            if (res.status === 401) return { ok: false, message: 'SID or auth token rejected' }
            if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
            const data = await res.json()
            // A suspended account authenticates perfectly and sends nothing.
            if (data.status && data.status !== 'active') {
              return { ok: false, message: `Account status is "${data.status}" — texts will not send.` }
            }
            return { ok: true, message: `Account active${data.friendly_name ? ` (${data.friendly_name})` : ''}` }
          })
        : undefined,
  })

  // ---- The hosted sites ----
  push({
    id: 'places',
    name: 'Google Places',
    purpose: 'Business lookup, addresses, hours, review counts',
    impact: 'Sites keep their cached ratings; refreshes and new lookups fail.',
    severity: 'degraded',
    configured: !!places,
    href: SETTINGS,
    result: places
      ? await probe(async () => {
          // Places API (New) — the one the app actually uses. Testing the
          // legacy endpoint would pass while every real call failed.
          const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'X-Goog-Api-Key': places,
              'X-Goog-FieldMask': 'places.id',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ textQuery: 'auto glass', maxResultCount: 1 }),
            signal: timeout(),
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok) return { ok: true, message: 'Places API (New) responding' }
          const reason = data?.error?.status || `HTTP ${res.status}`
          if (reason === 'PERMISSION_DENIED') {
            return { ok: false, message: 'Key rejected — check Places API (New) is enabled and billing is on.' }
          }
          return { ok: false, message: `${reason}${data?.error?.message ? ` — ${data.error.message}` : ''}` }
        })
      : undefined,
  })

  push({
    id: 'blob',
    name: 'Vercel Blob',
    purpose: 'Photo storage for client sites',
    impact: 'Photo uploads fail. Photos already uploaded keep serving.',
    severity: 'degraded',
    configured: !!blobToken,
    // Env vars only reach deployments built AFTER they were added, so a store
    // connected since the last deploy is invisible to the running one. That
    // looks identical to never having set it up.
    missing:
      'No BLOB_READ_WRITE_TOKEN in this deployment. Connecting a Blob store adds it automatically, but only to deployments built afterwards — if you connected it recently, redeploy.',
    result: blobToken
      ? await probe(async () => {
          const { list } = await import('@vercel/blob')
          const { blobs } = await list({ limit: 1, token: blobToken })
          return { ok: true, message: `Reachable${blobs.length ? '' : ' (store is empty)'}` }
        })
      : undefined,
  })

  const vercelToken = process.env.VERCEL_TOKEN
  const vercelProject = process.env.VERCEL_SITES_PROJECT_ID
  push({
    id: 'vercel',
    name: 'Vercel domains API',
    purpose: 'Attaching client subdomains and custom domains',
    impact: 'Live sites are unaffected. New domains cannot be attached or verified.',
    severity: 'optional',
    configured: !!(vercelToken && vercelProject),
    missing: `Missing ${[!vercelToken && 'VERCEL_TOKEN', !vercelProject && 'VERCEL_SITES_PROJECT_ID'].filter(Boolean).join(' and ')}. These are set by hand in Vercel → Settings → Environment Variables, and only reach deployments built afterwards.`,
    result:
      vercelToken && vercelProject
        ? await probe(async () => {
            const team = process.env.VERCEL_SITES_TEAM_ID
            const res = await fetch(
              `https://api.vercel.com/v9/projects/${vercelProject}${team ? `?teamId=${team}` : ''}`,
              { headers: { Authorization: `Bearer ${vercelToken}` }, signal: timeout() }
            )
            if (res.status === 401 || res.status === 403) {
              return { ok: false, message: 'Token rejected or lacks access to that project' }
            }
            if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
            const data = await res.json()
            return { ok: true, message: `Project "${data.name}" reachable` }
          })
        : undefined,
  })

  const cfToken = process.env.CLOUDFLARE_API_TOKEN
  push({
    id: 'cloudflare',
    name: 'Cloudflare DNS',
    purpose: 'Creating {client}.glassleads.app records',
    impact: 'Existing subdomains keep resolving. New ones cannot be provisioned.',
    severity: 'optional',
    configured: !!cfToken,
    missing:
      'No CLOUDFLARE_API_TOKEN in this deployment. Set in Vercel → Settings → Environment Variables; redeploy after adding.',
    result: cfToken
      ? await probe(async () => {
          const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            headers: { Authorization: `Bearer ${cfToken}` },
            signal: timeout(),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.success) {
            return { ok: false, message: data?.errors?.[0]?.message || `HTTP ${res.status}` }
          }
          return { ok: true, message: `Token ${data.result?.status || 'valid'}` }
        })
      : undefined,
  })

  // ---- Call coaching ----
  push({
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    purpose: 'Call coaching, location-page drafts, site import',
    impact: 'Calls are still recorded but not scored. Leads are unaffected.',
    severity: 'degraded',
    configured: !!anthropic,
    href: SETTINGS,
    result: anthropic
      ? await probe(async () => {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': anthropic,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4,
              messages: [{ role: 'user', content: 'ok' }],
            }),
            signal: timeout(15_000),
          })
          if (res.status === 401) return { ok: false, message: 'API key rejected' }
          if (res.status === 429) return { ok: false, message: 'Rate limited or out of credit' }
          if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
          return { ok: true, message: 'Responding' }
        })
      : undefined,
  })

  push({
    id: 'deepgram',
    name: 'Deepgram',
    purpose: 'Call recording transcription',
    impact: 'Call coaching stops at the download step — no transcript, no score.',
    severity: 'degraded',
    configured: !!deepgram,
    result: deepgram
      ? await probe(async () => {
          const res = await fetch('https://api.deepgram.com/v1/projects', {
            headers: { Authorization: `Token ${deepgram}` },
            signal: timeout(),
          })
          if (res.status === 401 || res.status === 403) {
            return { ok: false, message: 'API key rejected' }
          }
          if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
          return { ok: true, message: 'Connected' }
        })
      : undefined,
  })

  // ---- Advertising ----
  const adsCheck = await probe(async () => {
    const { testAdsConnection } = await import('@/lib/google-ads')
    const r = await testAdsConnection()
    return { ok: r.success, message: r.message }
  })
  const { getAdsCredentials } = await import('@/lib/google-ads')
  push({
    id: 'google-ads',
    name: 'Google Ads API',
    purpose: 'Verifying managed clients’ conversions are recording',
    impact: 'Tag checks still work. Google’s own conversion counts are unavailable.',
    severity: 'optional',
    configured: !!(await getAdsCredentials()),
    href: SETTINGS,
    result: adsCheck,
  })

  return checks
}
