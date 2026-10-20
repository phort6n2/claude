import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { asServiceHeroLines, type HeroBullet, type SiteChapter } from '@/lib/site-content'
import { syncClientPhotosToWrhq } from '@/lib/wrhq-sync'

/**
 * A REVIEWED SET OF CONTENT CHANGES FOR ONE CLIENT, applied by a button.
 *
 * Why this exists rather than "edit it in the admin": a site rewrite touches
 * a dozen fields across four editors (the Business tab, the content editor's
 * sections and FAQ, the photo manager, the cutover redirects), and the
 * content lives in the production database, which nobody writing the copy can
 * reach. So the copy is written once, as data, committed where it can be read
 * line by line, and applied in one press — with a dry run that shows what it
 * WOULD change against what is live right now.
 *
 * READ BEFORE WRITE, ALWAYS. Every operation names what it expects to find
 * (`from`, a substring, a heading, a question, an alt text). If the live
 * content no longer matches — somebody edited it after the patch was written —
 * the operation is a CONFLICT and NOTHING is applied, not even the operations
 * that would have worked. A patch is a reviewed whole; half of one is copy
 * nobody reviewed.
 *
 * IDEMPOTENT: an operation whose target is already in place reports
 * `already` and writes nothing, so pressing it twice is harmless.
 *
 * Writes with prisma directly, so it does what `PUT /api/clients/[id]` would
 * have done afterwards that matters here: it pushes the client to the
 * directory (a renamed business must not stay renamed in one app only).
 */

export interface ContentPatch {
  id: string
  title: string
  /** The client, by slug or site subdomain — must match exactly one. */
  client: string
  /** Fields on Client. `from` must equal the live value (or `to` already). */
  clientFields?: Array<{
    field: 'businessName' | 'email' | 'country' | 'offersRockChipRepair' | 'offersWindshieldRepair' | 'marketArea'
    from: string | boolean | null
    to: string | boolean | null
  }>
  /** Substring replacements inside a text field of ClientSiteContent. */
  textReplace?: Array<{ field: 'warrantyText' | 'footerBlurb'; from: string; to: string }>
  /** Story sections, matched on their heading. */
  chapters?: { remove?: string[]; add?: SiteChapter[] }
  /** FAQ entries, matched on their question. */
  faq?: { remove?: string[]; replaceInAnswer?: Array<{ q: string; from: string; to: string }> }
  /** The whole bullet list, guarded by the leads it expects to replace. */
  heroBullets?: { fromLeads: string[]; to: HeroBullet[] }
  /** Per-service line under the H1, by service slug. */
  serviceHeroLines?: Record<string, string>
  photos?: { removeByAlt?: string[]; renameAlt?: Array<{ from: string; to: string }> }
  redirects?: Array<{ from: string; to: string }>
  /** Substring replacements in a city page's own copy (ClientCityContent.body). */
  cityText?: Array<{ city: string; from: string; to: string }>
  /** `country` on the client's location rows (the schema reads the primary one). */
  locationCountry?: { from: string; to: string }
}

export type OpStatus = 'apply' | 'already' | 'conflict'

export interface OpReport {
  op: string
  status: OpStatus
  /** What is live now, trimmed for reading — never a credential, there are none here. */
  live?: string
  becomes?: string
  why?: string
}

export interface PatchReport {
  patch: string
  client: { id: string; businessName: string } | null
  ok: boolean
  applied: boolean
  conflicts: number
  ops: OpReport[]
  error?: string
}

const short = (v: unknown, n = 160) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s && s.length > n ? `${s.slice(0, n)}…` : s
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

interface FaqRow {
  q: string
  a: string
}

/**
 * Work out every operation against the live rows. Pure apart from the reads,
 * and returns the rows as they WOULD be written, so apply is just "write
 * these" and can never drift from what the dry run showed.
 */
async function plan(patch: ContentPatch) {
  const matches = await prisma.client.findMany({
    where: { OR: [{ slug: patch.client }, { siteSubdomain: patch.client }] },
    select: {
      id: true,
      businessName: true,
      email: true,
      country: true,
      offersRockChipRepair: true,
      offersWindshieldRepair: true,
      marketArea: true,
    },
  })
  if (matches.length !== 1) {
    return { error: `Expected exactly one client for "${patch.client}", found ${matches.length}.` } as const
  }
  const client = matches[0]
  const [content, photos, redirects, locations, cities] = await Promise.all([
    prisma.clientSiteContent.findUnique({ where: { clientId: client.id } }),
    prisma.clientSitePhoto.findMany({ where: { clientId: client.id } }),
    prisma.clientRedirect.findMany({ where: { clientId: client.id } }),
    prisma.clientLocation.findMany({ where: { clientId: client.id }, select: { id: true, label: true, country: true } }),
    prisma.clientCityContent.findMany({ where: { clientId: client.id }, select: { id: true, city: true, body: true } }),
  ])

  const ops: OpReport[] = []
  const clientData: Record<string, unknown> = {}
  const contentData: Record<string, unknown> = {}

  for (const f of patch.clientFields || []) {
    // An empty string and a null are the same "not set" in these columns.
    const raw = (client as Record<string, unknown>)[f.field]
    const live = raw === '' || raw === undefined ? null : raw
    const op = `Client.${f.field}`
    if (live === f.to) ops.push({ op, status: 'already', live: short(live) })
    else if (live === f.from) {
      ops.push({ op, status: 'apply', live: short(live), becomes: short(f.to) })
      clientData[f.field] = f.to
    } else ops.push({ op, status: 'conflict', live: short(live), why: `expected ${short(f.from)}` })
  }

  const texts: Record<string, string | null> = {
    warrantyText: content?.warrantyText ?? null,
    footerBlurb: content?.footerBlurb ?? null,
  }
  for (const r of patch.textReplace || []) {
    const op = `${r.field}: "${short(r.from, 60)}"`
    const live = texts[r.field] || ''
    if (live.includes(r.from)) {
      texts[r.field] = live.split(r.from).join(r.to)
      contentData[r.field] = texts[r.field]
      ops.push({ op, status: 'apply', becomes: short(r.to) })
    } else if (r.to && live.includes(r.to)) ops.push({ op, status: 'already' })
    else ops.push({ op, status: 'conflict', live: short(live), why: 'text to replace not found' })
  }

  if (patch.chapters) {
    // The RAW stored array, not asChapters(): that reader drops empty rows and
    // caps at five, and writing its output back would delete whatever it hid.
    let chapters: SiteChapter[] = Array.isArray(content?.chapters)
      ? (content!.chapters as unknown as SiteChapter[])
      : []
    for (const heading of patch.chapters.remove || []) {
      const op = `Remove section "${heading}"`
      const before = chapters.length
      chapters = chapters.filter((c) => norm(c?.heading || '') !== norm(heading))
      if (chapters.length < before) ops.push({ op, status: 'apply' })
      else ops.push({ op, status: 'already' })
    }
    for (const add of patch.chapters.add || []) {
      const op = `Add section "${add.heading}"`
      if (chapters.some((c) => norm(c?.heading || '') === norm(add.heading))) ops.push({ op, status: 'already' })
      else {
        chapters.push(add)
        ops.push({ op, status: 'apply', becomes: short(add.body) })
      }
    }
    contentData.chapters = chapters
  }

  if (patch.faq) {
    let faq: FaqRow[] = Array.isArray(content?.faq) ? (content!.faq as unknown as FaqRow[]) : []
    for (const q of patch.faq.remove || []) {
      const op = `Remove FAQ "${q}"`
      const before = faq.length
      faq = faq.filter((f) => norm(f.q || '') !== norm(q))
      ops.push({ op, status: faq.length < before ? 'apply' : 'already' })
    }
    for (const r of patch.faq.replaceInAnswer || []) {
      const op = `FAQ answer "${short(r.q, 60)}"`
      const item = faq.find((f) => norm(f.q || '') === norm(r.q))
      if (!item) ops.push({ op, status: 'conflict', why: 'question not found' })
      else if (item.a.includes(r.from)) {
        item.a = item.a.split(r.from).join(r.to)
        ops.push({ op, status: 'apply', becomes: short(r.to) })
      } else if (item.a.includes(r.to)) ops.push({ op, status: 'already' })
      else ops.push({ op, status: 'conflict', live: short(item.a), why: 'text to replace not found' })
    }
    contentData.faq = faq
  }

  if (patch.heroBullets) {
    const live = Array.isArray(content?.heroBullets) ? (content!.heroBullets as unknown as HeroBullet[]) : []
    const leads = live.map((b) => b.lead)
    const op = 'Hero bullets'
    if (JSON.stringify(live) === JSON.stringify(patch.heroBullets.to)) ops.push({ op, status: 'already' })
    else if (JSON.stringify(leads.map(norm)) === JSON.stringify(patch.heroBullets.fromLeads.map(norm))) {
      contentData.heroBullets = patch.heroBullets.to
      ops.push({ op, status: 'apply', live: leads.join(' | '), becomes: patch.heroBullets.to.map((b) => b.lead).join(' | ') })
    } else ops.push({ op, status: 'conflict', live: leads.join(' | '), why: `expected ${patch.heroBullets.fromLeads.join(' | ')}` })
  }

  if (patch.serviceHeroLines) {
    const live = asServiceHeroLines(content?.serviceHeroLines)
    const next = { ...live }
    for (const [slug, line] of Object.entries(patch.serviceHeroLines)) {
      const op = `Hero line on /${slug}`
      if (live[slug] === line) ops.push({ op, status: 'already' })
      else if (live[slug]) ops.push({ op, status: 'conflict', live: short(live[slug]), why: 'a different line is already set' })
      else {
        next[slug] = line
        ops.push({ op, status: 'apply', becomes: short(line) })
      }
    }
    contentData.serviceHeroLines = next
  }

  const photoDeletes: string[] = []
  const photoRenames: Array<{ id: string; alt: string }> = []
  for (const alt of patch.photos?.removeByAlt || []) {
    const hit = photos.filter((p) => p.alt === alt)
    const op = `Remove photo "${alt}"`
    if (hit.length) {
      photoDeletes.push(...hit.map((p) => p.id))
      ops.push({ op, status: 'apply', live: hit.map((p) => p.url).join(' ') })
    } else ops.push({ op, status: 'already' })
  }
  for (const r of patch.photos?.renameAlt || []) {
    const hit = photos.filter((p) => p.alt === r.from)
    const op = `Photo caption "${short(r.from, 60)}"`
    if (hit.length) {
      photoRenames.push(...hit.map((p) => ({ id: p.id, alt: r.to })))
      ops.push({ op, status: 'apply', becomes: r.to })
    } else if (photos.some((p) => p.alt === r.to)) ops.push({ op, status: 'already' })
    else ops.push({ op, status: 'conflict', why: 'no photo with that caption' })
  }

  const redirectCreates: Array<{ fromPath: string; toPath: string }> = []
  for (const r of patch.redirects || []) {
    const op = `Redirect ${r.from} → ${r.to}`
    const existing = redirects.find((x) => x.fromPath === r.from)
    if (!existing) {
      redirectCreates.push({ fromPath: r.from, toPath: r.to })
      ops.push({ op, status: 'apply' })
    } else if (existing.toPath === r.to) ops.push({ op, status: 'already' })
    else ops.push({ op, status: 'conflict', live: existing.toPath, why: 'that address already redirects elsewhere' })
  }

  const cityUpdates = new Map<string, string>()
  for (const r of patch.cityText || []) {
    const op = `${r.city} page copy: "${short(r.from, 60)}"`
    const row = cities.find((c) => norm(c.city) === norm(r.city))
    const live = row ? (cityUpdates.get(row.id) ?? row.body ?? '') : ''
    if (!row) ops.push({ op, status: 'conflict', why: 'no copy stored for that city' })
    else if (live.includes(r.from)) {
      cityUpdates.set(row.id, live.split(r.from).join(r.to))
      ops.push({ op, status: 'apply', becomes: short(r.to) })
    } else if (live.includes(r.to)) ops.push({ op, status: 'already' })
    else ops.push({ op, status: 'conflict', live: short(live), why: 'text to replace not found' })
  }

  const locationUpdates: string[] = []
  if (patch.locationCountry) {
    const { from, to } = patch.locationCountry
    for (const l of locations) {
      const op = `Location "${l.label}" country`
      if (l.country === to) ops.push({ op, status: 'already', live: l.country })
      else if (l.country === from) {
        locationUpdates.push(l.id)
        ops.push({ op, status: 'apply', live: l.country, becomes: to })
      } else ops.push({ op, status: 'conflict', live: l.country, why: `expected ${from}` })
    }
  }

  return { client, contentExists: !!content, ops, clientData, contentData, photoDeletes, photoRenames, redirectCreates, locationUpdates, cityUpdates } as const
}

export async function runContentPatch(patch: ContentPatch, opts: { dryRun: boolean }): Promise<PatchReport> {
  const p = await plan(patch)
  if ('error' in p) {
    return { patch: patch.id, client: null, ok: false, applied: false, conflicts: 0, ops: [], error: p.error }
  }
  const conflicts = p.ops.filter((o) => o.status === 'conflict').length
  const base = {
    patch: patch.id,
    client: { id: p.client.id, businessName: p.client.businessName },
    conflicts,
    ops: p.ops,
  }
  if (conflicts) {
    return {
      ...base,
      ok: false,
      applied: false,
      error: `${conflicts} operation(s) no longer match what is live — nothing was applied. Read the conflicts, then update the patch.`,
    }
  }
  const pending = p.ops.some((o) => o.status === 'apply')
  if (opts.dryRun || !pending) return { ...base, ok: true, applied: false }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(p.clientData).length) {
      await tx.client.update({ where: { id: p.client.id }, data: p.clientData })
    }
    if (Object.keys(p.contentData).length) {
      const data = p.contentData as Prisma.ClientSiteContentUncheckedUpdateInput
      if (p.contentExists) await tx.clientSiteContent.update({ where: { clientId: p.client.id }, data })
      else {
        await tx.clientSiteContent.create({
          data: { ...(data as Prisma.ClientSiteContentUncheckedCreateInput), clientId: p.client.id },
        })
      }
    }
    if (p.photoDeletes.length) await tx.clientSitePhoto.deleteMany({ where: { id: { in: p.photoDeletes } } })
    for (const r of p.photoRenames) await tx.clientSitePhoto.update({ where: { id: r.id }, data: { alt: r.alt } })
    for (const [id, body] of p.cityUpdates) await tx.clientCityContent.update({ where: { id }, data: { body } })
    if (p.locationUpdates.length && patch.locationCountry) {
      await tx.clientLocation.updateMany({ where: { id: { in: p.locationUpdates } }, data: { country: patch.locationCountry.to } })
    }
    for (const r of p.redirectCreates) {
      await tx.clientRedirect.create({ data: { clientId: p.client.id, fromPath: r.fromPath, toPath: r.toPath } })
    }
  })

  // The name, email and services are on the directory listing too.
  if (Object.keys(p.clientData).length) {
    await syncClientPhotosToWrhq(p.client.id).catch(() => null)
  }
  return { ...base, ok: true, applied: true }
}
