import { prisma } from '@/lib/db'
import { VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from '@/lib/vercel-config'

/**
 * Automated provisioning of short client subdomains
 * (e.g. collision.glassleads.app).
 *
 * "Connect" does three things: saves the subdomain on the client, creates the
 * DNS-only CNAME in Cloudflare ({sub} → cname.vercel-dns.com), and attaches
 * {sub}.glassleads.app to the Vercel project so a certificate is issued.
 * Both API calls are idempotent-ish: an already-existing record/domain is
 * treated as success so re-connecting is safe.
 *
 * Required environment variables (see .env.example):
 *   CLOUDFLARE_API_TOKEN — token with Zone → DNS → Edit on glassleads.app
 *   CLOUDFLARE_ZONE_ID   — the glassleads.app zone id
 *   VERCEL_TOKEN         — Vercel account token
 *   VERCEL_PROJECT_ID / VERCEL_TEAM_ID — optional overrides; default to the
 *   agmp-paa-pro project and its team.
 */

const ROOT_DOMAIN = 'glassleads.app'

/** Subdomains that must never become client sites. */
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'portal', 'mail', 'email', 'smtp', 'ftp',
  'blog', 'dev', 'staging', 'test', 'demo', 'status', 'help', 'docs', 'cdn',
  'assets', 'static', 'leads', 'dashboard', 'login', 'auth', 'widget',
  'master-leads', 'sites', 'ns1', 'ns2',
])

export function validateSubdomain(raw: string): { ok: true; subdomain: string } | { ok: false; error: string } {
  const subdomain = raw.trim().toLowerCase()
  if (!subdomain) return { ok: false, error: 'Subdomain is required' }
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    return { ok: false, error: 'Use only letters, numbers, and hyphens (no leading/trailing hyphen)' }
  }
  if (RESERVED.has(subdomain)) {
    return { ok: false, error: `"${subdomain}" is reserved` }
  }
  return { ok: true, subdomain }
}

interface StepResult {
  step: string
  ok: boolean
  detail: string
}

async function createCloudflareRecord(subdomain: string): Promise<StepResult> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const zoneId = process.env.CLOUDFLARE_ZONE_ID
  if (!token || !zoneId) {
    return {
      step: 'cloudflare',
      ok: false,
      detail: 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID are not configured',
    }
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'CNAME',
          name: subdomain, // Cloudflare expands to {subdomain}.glassleads.app
          content: 'cname.vercel-dns.com',
          proxied: false, // DNS-only: Vercel must terminate TLS to issue the cert
          ttl: 1, // auto
          comment: 'glassleads client site (provisioned by admin)',
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const data = await response.json()
    if (data.success) {
      return { step: 'cloudflare', ok: true, detail: 'CNAME created' }
    }
    const firstError = data.errors?.[0]
    // 81057 / 81053: an identical or conflicting record already exists —
    // treat an identical one as success so reconnecting is idempotent.
    if (firstError?.code === 81057) {
      return { step: 'cloudflare', ok: true, detail: 'CNAME already existed' }
    }
    return {
      step: 'cloudflare',
      ok: false,
      detail: firstError?.message || `Cloudflare error (${response.status})`,
    }
  } catch (err) {
    return {
      step: 'cloudflare',
      ok: false,
      detail: err instanceof Error ? err.message : 'Cloudflare request failed',
    }
  }
}

async function attachVercelDomain(subdomain: string): Promise<StepResult> {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    return { step: 'vercel', ok: false, detail: 'VERCEL_TOKEN is not configured' }
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: `${subdomain}.${ROOT_DOMAIN}` }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const data = await response.json()
    if (response.ok) {
      return { step: 'vercel', ok: true, detail: 'Domain attached to project' }
    }
    if (data.error?.code === 'domain_already_in_use' && data.error?.projectId === VERCEL_PROJECT_ID) {
      return { step: 'vercel', ok: true, detail: 'Domain already attached' }
    }
    return {
      step: 'vercel',
      ok: false,
      detail: data.error?.message || `Vercel error (${response.status})`,
    }
  } catch (err) {
    return {
      step: 'vercel',
      ok: false,
      detail: err instanceof Error ? err.message : 'Vercel request failed',
    }
  }
}

export interface ProvisionResult {
  ok: boolean
  domain: string
  steps: StepResult[]
}

export async function provisionSubdomain(clientId: string, rawSubdomain: string): Promise<ProvisionResult | { ok: false; error: string }> {
  const validated = validateSubdomain(rawSubdomain)
  if (!validated.ok) return { ok: false, error: validated.error }
  const { subdomain } = validated

  // Uniqueness across clients (both as subdomain and as an existing slug).
  const conflict = await prisma.client.findFirst({
    where: {
      OR: [{ siteSubdomain: subdomain }, { slug: subdomain }],
      NOT: { id: clientId },
    },
    select: { businessName: true },
  })
  if (conflict) {
    return { ok: false, error: `"${subdomain}" is already used by ${conflict.businessName}` }
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { siteSubdomain: subdomain },
  })

  const steps: StepResult[] = []
  steps.push(await createCloudflareRecord(subdomain))
  steps.push(await attachVercelDomain(subdomain))

  return {
    ok: steps.every((s) => s.ok),
    domain: `${subdomain}.${ROOT_DOMAIN}`,
    steps,
  }
}
