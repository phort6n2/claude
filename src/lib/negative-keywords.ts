import { adsMutate, adsSearch, getAdsCredentials } from '@/lib/google-ads'
import type { ExistingNegative, MatchType, PositiveKeyword } from '@/lib/bad-lead'

/**
 * Negative keywords in Google Ads: what a campaign already excludes and buys
 * (read), and adding or removing one (write). The writes follow the Target
 * CPA pattern: `validateOnly: true` first, the real request only if that
 * passes, then READ BACK — a 200 is not proof it landed.
 *
 * ONLY AGMP CAMPAIGNS, checked here against a live read rather than trusted
 * from the caller, because a caller holding a campaign id is not proof the
 * campaign is ours.
 */

type Row = Record<string, unknown>
const obj = (v: unknown): Row => (v && typeof v === 'object' ? (v as Row) : {})
const s = (v: unknown): string => (v == null ? '' : String(v))
const digits = (v: unknown) => s(v).replace(/\D/g, '')
const quote = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export const SHARED_LIST_NAME = 'AGMP Negative Keyword List'

export interface AttachedList {
  id: string
  name: string
  /** The account the list lives in: the client's own, or the manager's. */
  ownerCustomerId: string
  memberCount: number
}

export interface CampaignNegatives {
  existing: ExistingNegative[]
  lists: AttachedList[]
  errors: string[]
}

/**
 * Everything already excluding searches from this campaign: its own
 * negatives, the ad group's when there is one, and every negative list
 * attached to it. A manager-owned list (the shared AGMP one) is reported under
 * the CLIENT's resource name by the client account, and its members can only
 * be read from the manager — so a list that reads empty in the client account
 * is read again there.
 */
export async function readNegatives(
  customerId: string,
  campaignId: string,
  adGroupId: string | null
): Promise<CampaignNegatives> {
  const cid = digits(customerId)
  const errors: string[] = []
  const existing: ExistingNegative[] = []
  const [own, group, attached] = await Promise.all([
    adsSearch(
      cid,
      `SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion
       WHERE campaign.id = ${digits(campaignId)} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`
    ),
    adGroupId
      ? adsSearch(
          cid,
          `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion
           WHERE ad_group.id = ${digits(adGroupId)} AND ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD'
             AND ad_group_criterion.status != 'REMOVED'`
        )
      : Promise.resolve({ ok: true as const, rows: [] }),
    adsSearch(
      cid,
      `SELECT shared_set.id, shared_set.name, shared_set.member_count FROM campaign_shared_set
       WHERE campaign.id = ${digits(campaignId)} AND shared_set.type = 'NEGATIVE_KEYWORDS'
         AND campaign_shared_set.status = 'ENABLED' AND shared_set.status = 'ENABLED'`
    ),
  ])
  if (own.ok) {
    for (const r of own.rows) {
      const kw = obj(obj(obj(r).campaignCriterion).keyword)
      existing.push({ text: s(kw.text), matchType: s(kw.matchType), where: 'this campaign' })
    }
  } else errors.push(`Campaign negatives: ${own.error}`)
  if (group.ok) {
    for (const r of group.rows) {
      const kw = obj(obj(obj(r).adGroupCriterion).keyword)
      existing.push({ text: s(kw.text), matchType: s(kw.matchType), where: 'this ad group' })
    }
  } else errors.push(`Ad group negatives: ${group.error}`)

  const lists: AttachedList[] = []
  if (attached.ok) {
    const creds = await getAdsCredentials()
    const manager = creds?.loginCustomerId || ''
    for (const r of attached.rows) {
      const set = obj(obj(r).sharedSet)
      const id = s(set.id)
      if (!id) continue
      const name = s(set.name)
      const memberCount = Number(s(set.memberCount)) || 0
      let owner = cid
      let members = await adsSearch(
        cid,
        `SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.id = ${id}`
      )
      if (memberCount > 0 && (!members.ok || members.rows.length === 0) && manager && manager !== cid) {
        owner = manager
        members = await adsSearch(
          manager,
          `SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.id = ${id}`
        )
      }
      lists.push({ id, name, ownerCustomerId: owner, memberCount })
      if (!members.ok) {
        errors.push(`List "${name}": ${members.error}`)
        continue
      }
      for (const m of members.rows) {
        const kw = obj(obj(obj(m).sharedCriterion).keyword)
        existing.push({ text: s(kw.text), matchType: s(kw.matchType), where: `list "${name}"` })
      }
    }
  } else errors.push(`Negative lists: ${attached.error}`)
  return { existing, lists, errors }
}

/** The keywords this campaign is buying — a negative must not block one. PMax has none. */
export async function readPositives(
  customerId: string,
  campaignId: string
): Promise<{ ok: true; list: PositiveKeyword[] } | { ok: false; error: string }> {
  const res = await adsSearch(
    digits(customerId),
    `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group.name FROM ad_group_criterion
     WHERE campaign.id = ${digits(campaignId)} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE
       AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED'`
  )
  if (!res.ok) return res
  return {
    ok: true,
    list: res.rows.map((r) => {
      const row = obj(r)
      const kw = obj(obj(row.adGroupCriterion).keyword)
      return { text: s(kw.text), matchType: s(kw.matchType), adGroupName: s(obj(row.adGroup).name) || null }
    }),
  }
}

/** The manager account's shared AGMP list, by name. */
export async function findSharedList(): Promise<AttachedList | null> {
  const creds = await getAdsCredentials()
  const manager = creds?.loginCustomerId
  if (!manager) return null
  const res = await adsSearch(
    manager,
    `SELECT shared_set.id, shared_set.name, shared_set.member_count FROM shared_set
     WHERE shared_set.name = '${quote(SHARED_LIST_NAME)}' AND shared_set.status = 'ENABLED' AND shared_set.type = 'NEGATIVE_KEYWORDS'`
  )
  const set = res.ok ? obj(obj(res.rows[0]).sharedSet) : {}
  return s(set.id) ? { id: s(set.id), name: s(set.name), ownerCustomerId: manager, memberCount: Number(s(set.memberCount)) || 0 } : null
}

export type Level = 'campaign' | 'ad_group' | 'shared_list'

export interface NegativeTarget {
  /** The client's account. */
  customerId: string
  level: Level
  campaignId: string | null
  adGroupId: string | null
  list: AttachedList | null
}

const RESOURCE: Record<Level, string> = { campaign: 'campaignCriteria', ad_group: 'adGroupCriteria', shared_list: 'sharedCriteria' }

/** Confirms, live, that the target is an ENABLED AGMP campaign (and the ad group is in it). */
export async function checkTarget(t: NegativeTarget): Promise<{ ok: true; campaignName: string | null; adGroupName: string | null } | { ok: false; error: string }> {
  if (t.level === 'shared_list') {
    if (!t.list) return { ok: false, error: 'No negative list chosen.' }
    return { ok: true, campaignName: null, adGroupName: null }
  }
  if (!t.campaignId) return { ok: false, error: 'No campaign to add it to.' }
  const res = await adsSearch(
    digits(t.customerId),
    `SELECT campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${digits(t.campaignId)}`
  )
  if (!res.ok) return { ok: false, error: `Could not read the campaign: ${res.error}` }
  const c = obj(obj(res.rows[0]).campaign)
  const name = s(c.name)
  if (!name) return { ok: false, error: 'Google has no such campaign in that account.' }
  if (!name.startsWith('AGMP')) return { ok: false, error: `"${name}" does not start with AGMP. Not touched.` }
  if (s(c.status) !== 'ENABLED') return { ok: false, error: `"${name}" is not enabled.` }
  if (t.level === 'ad_group') {
    if (s(c.advertisingChannelType) === 'PERFORMANCE_MAX') return { ok: false, error: 'Performance Max has no ad groups — add it to the campaign instead.' }
    if (!t.adGroupId) return { ok: false, error: 'No ad group to add it to.' }
    const ag = await adsSearch(
      digits(t.customerId),
      `SELECT ad_group.name, campaign.id FROM ad_group WHERE ad_group.id = ${digits(t.adGroupId)}`
    )
    const row = ag.ok ? obj(ag.rows[0]) : {}
    if (s(obj(row.campaign).id) !== digits(t.campaignId)) return { ok: false, error: 'That ad group is not in that campaign.' }
    return { ok: true, campaignName: name, adGroupName: s(obj(row.adGroup).name) || null }
  }
  return { ok: true, campaignName: name, adGroupName: null }
}

function createOp(t: NegativeTarget, keyword: { text: string; matchType: MatchType }) {
  const cid = digits(t.customerId)
  if (t.level === 'campaign') return { create: { campaign: `customers/${cid}/campaigns/${digits(t.campaignId)}`, negative: true, keyword } }
  if (t.level === 'ad_group') return { create: { adGroup: `customers/${cid}/adGroups/${digits(t.adGroupId)}`, negative: true, keyword } }
  const owner = digits(t.list!.ownerCustomerId)
  return { create: { sharedSet: `customers/${owner}/sharedSets/${digits(t.list!.id)}`, keyword } }
}

const ownerOf = (t: NegativeTarget) => (t.level === 'shared_list' ? digits(t.list!.ownerCustomerId) : digits(t.customerId))

async function readBack(owner: string, level: Level, resourceName: string): Promise<boolean> {
  const view = level === 'campaign' ? 'campaign_criterion' : level === 'ad_group' ? 'ad_group_criterion' : 'shared_criterion'
  const res = await adsSearch(owner, `SELECT ${view}.resource_name FROM ${view} WHERE ${view}.resource_name = '${quote(resourceName)}'`)
  return res.ok && res.rows.length > 0
}

export type WriteResult =
  | { ok: true; resourceName: string; confirmed: boolean; campaignName: string | null; adGroupName: string | null }
  | { ok: false; stage: 'check' | 'validate' | 'send'; error: string; campaignName?: string | null; adGroupName?: string | null }

export async function addNegative(t: NegativeTarget, keyword: { text: string; matchType: MatchType }): Promise<WriteResult> {
  const check = await checkTarget(t)
  if (!check.ok) return { ok: false, stage: 'check', error: check.error }
  const names = { campaignName: check.campaignName, adGroupName: check.adGroupName }
  const owner = ownerOf(t)
  const body = (validateOnly: boolean) => ({ operations: [createOp(t, keyword)], validateOnly })
  const test = await adsMutate(owner, RESOURCE[t.level], body(true))
  if (!test.ok) return { ok: false, stage: 'validate', error: test.error, ...names }
  const sent = await adsMutate(owner, RESOURCE[t.level], body(false))
  if (!sent.ok) return { ok: false, stage: 'send', error: sent.error, ...names }
  const results = (sent.data.results as Array<{ resourceName?: string }> | undefined) || []
  const resourceName = s(results[0]?.resourceName)
  if (!resourceName) return { ok: false, stage: 'send', error: 'Google answered without a resource name.', ...names }
  return { ok: true, resourceName, confirmed: await readBack(owner, t.level, resourceName), ...names }
}

/** Removes exactly the criterion that was added — never "anything with this text". */
export async function removeNegative(
  owner: string,
  level: Level,
  resourceName: string
): Promise<{ ok: true; confirmed: boolean } | { ok: false; stage: 'validate' | 'send'; error: string }> {
  const body = (validateOnly: boolean) => ({ operations: [{ remove: resourceName }], validateOnly })
  const test = await adsMutate(digits(owner), RESOURCE[level], body(true))
  if (!test.ok) return { ok: false, stage: 'validate', error: test.error }
  const sent = await adsMutate(digits(owner), RESOURCE[level], body(false))
  if (!sent.ok) return { ok: false, stage: 'send', error: sent.error }
  return { ok: true, confirmed: !(await readBack(digits(owner), level, resourceName)) }
}
