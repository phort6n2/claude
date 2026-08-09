/**
 * Custom domains for hosted client sites.
 *
 * A client points their own domain at us instead of (or as well as) their
 * {label}.glassleads.app subdomain. Three things have to line up and they are
 * genuinely independent, which is why the status here is not a single
 * boolean:
 *
 *   1. The domain is ATTACHED to our Vercel project.
 *   2. Vercel has VERIFIED ownership — only required when the domain is
 *      already attached to some other Vercel account, in which case Vercel
 *      asks for a TXT record.
 *   3. The DNS actually POINTS here, which Vercel reports as `misconfigured`.
 *
 * A domain is live only when it is attached, verified, and not misconfigured.
 * Reporting "added" as if it were "working" is how a client ends up pointing
 * customers at a domain that doesn't resolve.
 *
 * Every DNS value shown to an operator comes from Vercel's own response
 * (`recommendedIPv4` / `recommendedCNAME`). Hardcoding 76.76.21.21 or
 * cname.vercel-dns.com works right up until Vercel changes it, and then the
 * failure is a client's live site.
 */

const VERCEL_PROJECT_ID = process.env.VERCEL_SITES_PROJECT_ID || 'prj_ippcpQAys3gDB9FMk11ufiy3B0Vf'
const VERCEL_TEAM_ID = process.env.VERCEL_SITES_TEAM_ID || 'team_i0q8dHvyszgaaysrJ4pkWoHL'
const API = 'https://api.vercel.com'

export interface DnsRecord {
  type: 'A' | 'CNAME' | 'TXT'
  name: string
  value: string
}

export interface DomainStatus {
  domain: string
  /** Attached to the Vercel project. */
  attached: boolean
  /** Ownership proven (or never required). */
  verified: boolean
  /** Vercel can see correct DNS. */
  misconfigured: boolean
  /** attached && verified && !misconfigured */
  live: boolean
  /** What the operator has to add at the registrar, in Vercel's own words. */
  records: DnsRecord[]
  error: string | null
}

/**
 * Normalise what someone typed into a bare hostname.
 *
 * Operators paste "https://www.example.com/" as often as they type
 * "example.com", and a scheme or trailing slash reaches the Vercel API as an
 * invalid name with an unhelpful error.
 */
export function normalizeDomain(raw: string): { ok: true; domain: string } | { ok: false; error: string } {
  let value = (raw || '').trim().toLowerCase()
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
  if (!value) return { ok: false, error: 'Enter a domain.' }
  if (value.includes('@')) return { ok: false, error: 'That looks like an email address.' }
  if (!/^[a-z0-9.-]+$/.test(value) || !value.includes('.')) {
    return { ok: false, error: 'That does not look like a domain (example.com).' }
  }
  if (value.endsWith('.glassleads.app')) {
    return {
      ok: false,
      error: 'glassleads.app subdomains are set up in the Site address section above, not here.',
    }
  }
  return { ok: true, domain: value }
}

/** An apex has exactly one dot and no leading label — it needs an A record. */
export function isApex(domain: string): boolean {
  return domain.split('.').length === 2
}

function vercelHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function vercel(path: string, token: string, init?: RequestInit) {
  const separator = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}${path}${separator}teamId=${VERCEL_TEAM_ID}`, {
    ...init,
    headers: vercelHeaders(token),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

/** Attach the domain to the project. Re-running is safe. */
export async function attachDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.VERCEL_TOKEN
  if (!token) return { ok: false, error: 'VERCEL_TOKEN is not configured' }

  const { res, data } = await vercel(`/v10/projects/${VERCEL_PROJECT_ID}/domains`, token, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  })
  if (res.ok) return { ok: true }
  // Already ours: idempotent success. Already someone else's: a real problem
  // the operator has to resolve in the other Vercel account.
  if (data?.error?.code === 'domain_already_in_use') {
    if (data.error.projectId === VERCEL_PROJECT_ID) return { ok: true }
    return {
      ok: false,
      error:
        'That domain is attached to a different Vercel project. Remove it there first, then add it here.',
    }
  }
  return { ok: false, error: data?.error?.message || `Vercel error (${res.status})` }
}

/** Remove the domain from the project. */
export async function detachDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.VERCEL_TOKEN
  if (!token) return { ok: false, error: 'VERCEL_TOKEN is not configured' }
  const { res, data } = await vercel(
    `/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
    token,
    { method: 'DELETE' }
  )
  // A domain that isn't there is the state we wanted.
  if (res.ok || res.status === 404) return { ok: true }
  return { ok: false, error: data?.error?.message || `Vercel error (${res.status})` }
}

/**
 * Ask Vercel where the domain stands, and what DNS it wants.
 *
 * Calls verify() first: it is the call that flips `verified` once the TXT
 * record is in place, and it is harmless when no verification is pending.
 */
export async function checkDomain(domain: string): Promise<DomainStatus> {
  const base: DomainStatus = {
    domain,
    attached: false,
    verified: false,
    misconfigured: true,
    live: false,
    records: [],
    error: null,
  }

  const token = process.env.VERCEL_TOKEN
  if (!token) return { ...base, error: 'VERCEL_TOKEN is not configured' }

  try {
    // Nudge verification, then read the result. Failure here is not fatal —
    // the GET below reports the real state either way.
    await vercel(
      `/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}/verify`,
      token,
      { method: 'POST' }
    ).catch(() => null)

    const { res: domRes, data: dom } = await vercel(
      `/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
      token
    )
    if (!domRes.ok) {
      if (domRes.status === 404) return { ...base, error: 'Not attached to the project yet.' }
      return { ...base, error: dom?.error?.message || `Vercel error (${domRes.status})` }
    }

    const attached = true
    const verified = dom?.verified === true

    // Ownership challenges, when Vercel wants a TXT record.
    const records: DnsRecord[] = Array.isArray(dom?.verification)
      ? dom.verification
          .filter((v: { type?: string }) => v?.type)
          .map((v: { type: string; domain: string; value: string }) => ({
            type: v.type.toUpperCase() as DnsRecord['type'],
            name: v.domain,
            value: v.value,
          }))
      : []

    const { data: cfg } = await vercel(`/v6/domains/${encodeURIComponent(domain)}/config`, token)
    const misconfigured = cfg?.misconfigured !== false

    // The pointing record. Apex domains cannot CNAME, so Vercel gives an IP;
    // subdomains get a CNAME target. Both come from Vercel, never from here.
    if (misconfigured) {
      if (isApex(domain) && cfg?.recommendedIPv4?.length) {
        const values: string[] = Array.isArray(cfg.recommendedIPv4[0]?.value)
          ? cfg.recommendedIPv4[0].value
          : cfg.recommendedIPv4
        values.forEach((value: string) => records.push({ type: 'A', name: '@', value }))
      } else if (cfg?.recommendedCNAME?.length) {
        const value =
          typeof cfg.recommendedCNAME[0] === 'string'
            ? cfg.recommendedCNAME[0]
            : cfg.recommendedCNAME[0]?.value
        const label = domain.split('.').slice(0, -2).join('.') || '@'
        if (value) records.push({ type: 'CNAME', name: label, value })
      }
    }

    return {
      domain,
      attached,
      verified,
      misconfigured,
      live: attached && verified && !misconfigured,
      records,
      error: null,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'Vercel request failed' }
  }
}
