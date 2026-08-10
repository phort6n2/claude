import { prisma } from '@/lib/db'
import { detachDomain } from '@/lib/custom-domains'
import { purgeClientPhotoFolder } from '@/lib/photo-upload'

/**
 * Removing a client, including the parts that do not live in the database.
 *
 * A `prisma.client.delete()` is not enough. The schema cascades every related
 * row, so the database ends up clean — and three things outside it do not:
 *
 *   1. Domains stay attached to the Vercel project. The subdomain keeps
 *      resolving, now to a 404, and the name cannot be cleanly reused.
 *   2. Photos stay in Blob storage, billed monthly, unreferenced by anything.
 *   3. The Cloudflare CNAME keeps pointing at Vercel.
 *
 * None of these announce themselves. You would find out months later from a
 * storage bill, or when re-adding a shop that left and came back.
 *
 * Order matters: external resources are released BEFORE the row is deleted,
 * because the row is where the list of what to release lives. Delete first and
 * the addresses of the orphans are gone with it.
 *
 * Every external step is best-effort and reported rather than fatal. A
 * Cloudflare outage must not leave a half-deleted client that cannot be
 * deleted again.
 */

export interface DeletionImpact {
  businessName: string
  slug: string
  leads: number
  soldLeads: number
  revenue: number
  photos: number
  portalUsers: number
  callAnalyses: number
  domains: string[]
  subdomain: string | null
  /** Oldest lead, so "three years of history" is visible before it is gone. */
  firstLeadAt: string | null
}

/** What a delete would destroy. Read-only. */
export async function getDeletionImpact(clientId: string): Promise<DeletionImpact | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      businessName: true,
      slug: true,
      siteSubdomain: true,
      domains: { select: { domain: true } },
    },
  })
  if (!client) return null

  const [leads, sold, photos, users, analyses, firstLead] = await Promise.all([
    prisma.lead.count({ where: { clientId } }),
    prisma.lead.aggregate({
      where: { clientId, status: 'SOLD' },
      _count: true,
      _sum: { saleValue: true },
    }),
    prisma.clientSitePhoto.count({ where: { clientId } }).catch(() => 0),
    prisma.clientUser.count({ where: { clientId } }).catch(() => 0),
    prisma.callAnalysis.count({ where: { lead: { clientId } } }).catch(() => 0),
    prisma.lead.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])

  return {
    businessName: client.businessName,
    slug: client.slug,
    leads,
    soldLeads: sold._count,
    revenue: sold._sum.saleValue ?? 0,
    photos,
    portalUsers: users,
    callAnalyses: analyses,
    domains: client.domains.map((d) => d.domain),
    subdomain: client.siteSubdomain,
    firstLeadAt: firstLead?.createdAt.toISOString() ?? null,
  }
}

export interface TeardownResult {
  ok: boolean
  /** Steps that ran, in order, for the operator to read. */
  steps: string[]
  /** External cleanup that failed. The client is still deleted. */
  warnings: string[]
  error?: string
}

export async function deleteClientCompletely(clientId: string): Promise<TeardownResult> {
  const steps: string[] = []
  const warnings: string[] = []

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      businessName: true,
      slug: true,
      siteSubdomain: true,
      domains: { select: { domain: true } },
      sitePhotos: { select: { url: true } },
    },
  })
  if (!client) return { ok: false, steps, warnings, error: 'Client not found' }

  // ---- 1. Release the domains ----
  const hosts = [
    ...client.domains.map((d) => d.domain),
    client.siteSubdomain ? `${client.siteSubdomain}.glassleads.app` : null,
  ].filter(Boolean) as string[]

  for (const host of hosts) {
    const result = await detachDomain(host).catch((e) => ({
      ok: false,
      error: e instanceof Error ? e.message : 'failed',
    }))
    if (result.ok) steps.push(`Detached ${host} from Vercel`)
    else warnings.push(`Could not detach ${host} from Vercel: ${result.error}. Remove it by hand.`)
  }

  // ---- 2. Release the storage ----
  //
  // By folder, not row by row. Row-by-row can only remove objects still
  // referenced by a surviving database row, and an object that outlived its
  // row is precisely the one that gets billed forever without anyone noticing.
  // Everything for a client lives under sites/{slug}/, so the folder is the
  // complete set.
  const purge = await purgeClientPhotoFolder(client.slug)
  if (purge.error) {
    warnings.push(
      `Storage NOT freed: ${purge.error}. Delete the sites/${client.slug}/ folder in Vercel → Storage → Blob, or you will keep paying for it.`
    )
  } else {
    steps.push(
      purge.deleted > 0
        ? `Deleted ${purge.deleted} file${purge.deleted === 1 ? '' : 's'} from storage (sites/${client.slug}/)`
        : 'No stored files to delete'
    )
  }

  // Photos referenced from somewhere other than our own storage — imported
  // from the client's old site — are counted so the numbers add up, but there
  // is nothing of ours to delete and nothing being billed.
  const external = client.sitePhotos.filter(
    (p) => !/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(p.url)
  ).length
  if (external > 0) {
    steps.push(`${external} photo${external === 1 ? ' was' : 's were'} hosted elsewhere — nothing to delete`)
  }

  // ---- 3. Delete the record; the schema cascades the rest ----
  try {
    await prisma.client.delete({ where: { id: clientId } })
    steps.push(`Deleted ${client.businessName} and everything linked to it`)
  } catch (error) {
    return {
      ok: false,
      steps,
      warnings,
      error: error instanceof Error ? error.message : 'Delete failed',
    }
  }

  // The Cloudflare record is knowingly left. Deleting it needs the record ID,
  // which is not stored, and a stale CNAME pointing at Vercel resolves to
  // nothing now that the domain is detached — harmless, unlike a domain still
  // attached to the project.
  if (client.siteSubdomain) {
    warnings.push(
      `The Cloudflare DNS record for ${client.siteSubdomain}.glassleads.app was left in place. It resolves to nothing now, but delete it in Cloudflare if you want the name tidy.`
    )
  }

  return { ok: true, steps, warnings }
}
