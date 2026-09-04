import { adsSearch } from '@/lib/google-ads'
import { CONVERSION_NAMES, CONVERSION_PREFIX } from '@/lib/google-ads-conversion-names'

/**
 * ONE conversion setup, identical in every client's Google Ads account.
 *
 * The problem this solves is not tidiness. Every account was set up by
 * whoever happened to be doing it that week, so the same event is called
 * "Calls from ads" in one account and "Call from Ads" in the next, counts a
 * call after 15 seconds here and 10 there, and looks back 30 days in one
 * place and 7 in another. Nothing is visibly broken, and yet no two accounts
 * can be compared, no report can be written that spans them, and nobody can
 * answer "is this shop tracking properly?" without opening the account and
 * reading it by eye.
 *
 * With one naming convention, the answer is a query — which is what
 * `auditConversionSetup` below is.
 *
 * THE NAMES ARE THE CONTRACT. Everything else here is a setting that can be
 * corrected in place; the name is what the audit matches on, what a report
 * groups by, and what someone reads in a column six months from now.
 *
 * RENAME, NEVER RECREATE. An existing action of the right shape under the
 * wrong name is a rename — its history, its learning and its conversion
 * volume all live on the action, and a fresh one starts from zero and puts
 * Smart Bidding back into learning. The audit says "rename this one" and
 * names it, for exactly that reason.
 */

// The names themselves live in google-ads-conversion-names.ts, which imports
// nothing — the Advertising tab's setup instructions are a client component
// and cannot import this file, which talks to the Ads API. Re-exported so
// this stays the one place server code asks for the convention.
export { CONVERSION_PREFIX }

export interface ConversionSpec {
  key: string
  /** The exact name the action must carry. */
  name: string
  category: string
  type: string
  origin: string
  /** One line: what actually makes this fire. */
  fires: string
  countingType: 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
  clickLookbackDays: number
  /** Only for the two call actions: seconds before a call counts. */
  callSeconds?: number
  /**
   * Whether this action's goal drives Smart Bidding.
   *
   * Primary and secondary are set per CATEGORY~ORIGIN goal, not per action —
   * which is why the four actions below deliberately sit in four different
   * categories. Two lead actions sharing a category could not be told apart
   * by bidding even if you wanted them to be.
   */
  biddable: boolean
  /** The steps, in the order they are done in the Google Ads UI. */
  setup: string[]
}

/**
 * The four. Three lead signals that bid, and the booked job that does not
 * bid yet.
 *
 * WHY THE SALE IS SECONDARY. Bidding to booked revenue is the goal and the
 * reason the offline upload exists — but a shop doing twenty jobs a month
 * cannot feed a value-based strategy, and switching to it early makes the
 * bidding worse, not better. So the sale is measured from day one and bid on
 * when the volume is there; the switch is a decision, not an oversight.
 */
export const CONVERSION_STANDARD: ConversionSpec[] = [
  {
    key: 'lead-form',
    name: CONVERSION_NAMES.leadForm,
    category: 'SUBMIT_LEAD_FORM',
    type: 'WEBPAGE',
    origin: 'WEBSITE',
    fires: 'The quote form on the hosted site is submitted.',
    countingType: 'ONE_PER_CLICK',
    // 90, because that is what every account already uses for this one and
    // because a windscreen is researched over days rather than minutes.
    clickLookbackDays: 90,
    biddable: true,
    setup: [
      'Goals → Conversions → New conversion action → Website.',
      'Scan the shop\'s site URL, then "Add a conversion action manually".',
      `Goal: Submit lead form. Name: ${CONVERSION_NAMES.leadForm}.`,
      'Value: "Don\'t use a value" — the value comes from the booked job, not the form.',
      'Count: One. Click-through window: 90 days. Attribution: data-driven.',
      'Take the tag\'s send_to (AW-xxx/LABEL) and paste it into the app on the Advertising tab; the site fires it on submit.',
    ],
  },
  {
    key: 'call-from-ads',
    name: CONVERSION_NAMES.callFromAds,
    category: 'PHONE_CALL_LEAD',
    type: 'AD_CALL',
    origin: 'CALL_FROM_ADS',
    fires: 'Someone taps the call asset in the ad itself, without landing on the site.',
    countingType: 'ONE_PER_CLICK',
    clickLookbackDays: 30,
    // 15 is Google's own default and the number that filters the wrong-number
    // and instant-hangup calls without discarding a real one.
    callSeconds: 15,
    biddable: true,
    setup: [
      'Goals → Conversions → New conversion action → Phone calls → Calls from ads using call assets.',
      `Name: ${CONVERSION_NAMES.callFromAds}.`,
      'Count a call after 15 seconds. Count: One. Click-through window: 30 days.',
      'Requires a call asset on the campaign — without one this action exists and never fires.',
    ],
  },
  {
    key: 'website-call',
    name: CONVERSION_NAMES.websiteCall,
    category: 'PHONE_CALL_LEAD',
    type: 'WEBSITE_CALL',
    origin: 'WEBSITE',
    fires: 'Someone calls the number shown on the site after arriving from an ad.',
    countingType: 'ONE_PER_CLICK',
    clickLookbackDays: 30,
    callSeconds: 15,
    biddable: true,
    setup: [
      'Goals → Conversions → New conversion action → Phone calls → Calls to a phone number on your website.',
      `Name: ${CONVERSION_NAMES.websiteCall}.`,
      'THE NUMBER MUST BE THE ONE THE SITE ACTUALLY SHOWS. If a tracking number is set in this app, the site shows that number — the conversion action has to name it, or Google swaps a number the page never displays and the action never fires.',
      'Count a call after 15 seconds. Count: One. Click-through window: 30 days.',
      'Paste the snippet\'s send_to into the app on the Advertising tab.',
    ],
  },
  {
    key: 'sale',
    name: CONVERSION_NAMES.sale,
    category: 'PURCHASE',
    type: 'UPLOAD_CLICKS',
    origin: 'WEBSITE',
    fires: 'This app uploads it when a lead is marked SOLD with a value.',
    countingType: 'ONE_PER_CLICK',
    // The uploader works to an 85-day click window against Google's 90.
    clickLookbackDays: 90,
    biddable: false,
    setup: [
      'Goals → Conversions → New conversion action → Import → Manual import using API or uploads.',
      `Goal: Purchase. Name: ${CONVERSION_NAMES.sale}.`,
      'Value: use different values for each conversion — the app sends the real job value.',
      'Count: One. Click-through window: 90 days.',
      'Set it as the offline conversion action on this client\'s Advertising tab, or nothing uploads to it.',
      'Leave the PURCHASE goal SECONDARY until this shop has the volume for value bidding.',
    ],
  },
]

/**
 * Names this platform used before the convention existed.
 *
 * Recognised so the audit can say "this is one of ours, under an old name"
 * rather than listing it as a stranger — and so nobody deletes an action
 * that months of conversion history are sitting on.
 */
export const LEGACY_NAMES: Record<string, string> = {
  'AGMP Call':
    "HighLevel's upload: it fires when a call reaches a HighLevel tracking number. Its category is Converted lead, which is right for it — it is a lead that arrived by phone, not the tag-measured call event. Not superseded by AGMP Sale. What it DOES collide with is AGMP Website Call, which counts the same inbound call once a shop moves onto a tracking number from this app. One or the other, never both.",
  'AGMP Form':
    'The same upload path for form fills, and it counts the same submission as AGMP Lead Form. One or the other.',
}

/**
 * The upload actions HighLevel writes to, paired with the tag action that
 * reports the same event once a shop is on this platform's own tracking.
 *
 * THE MIGRATION THIS DESCRIBES. Call tracking used to be HighLevel's: their
 * number, their upload, landing in AGMP Call. It is moving to Twilio numbers
 * in this app, with Google counting the call itself through AGMP Website
 * Call. During the move both can be live, and then one inbound call is two
 * conversions — the shop looks like it is doing twice the business and Smart
 * Bidding pays accordingly.
 *
 * Not a fault by itself: a shop still on HighLevel SHOULD have AGMP Call and
 * no website-call action. The fault is both at once, both bidding.
 */
const LEGACY_PAIRS: Array<{ legacy: string; supersededBy: string; event: string }> = [
  { legacy: 'AGMP Call', supersededBy: 'website-call', event: 'inbound call' },
  { legacy: 'AGMP Form', supersededBy: 'lead-form', event: 'form submission' },
]

export type FindingState = 'ok' | 'settings' | 'rename' | 'missing' | 'duplicate'

export interface ConversionFinding {
  key: string
  name: string
  state: FindingState
  /** The action this finding is about, when one was matched. */
  actionId?: string
  actionName?: string
  /** What to do, in the admin's words. */
  fix?: string
  /** Each setting that disagrees with the standard. */
  differences: string[]
  setup: string[]
  fires: string
}

export interface ConversionAudit {
  customerId: string
  findings: ConversionFinding[]
  /**
   * Actions that would count a lead this setup already counts. Kept apart
   * from goalIssues because the fix is different: these are things to switch
   * OFF or hold at Secondary, not settings to correct.
   */
  doubleCounting: string[]
  /** Goal keys whose biddability disagrees with the standard. */
  goalIssues: string[]
  /** AGMP-prefixed actions that are not part of the standard. */
  extras: Array<{ id: string; name: string; note: string }>
  /** True when nothing needs doing. */
  clean: boolean
}

interface RawAction {
  id: string
  name: string
  status: string
  type: string
  category: string
  origin: string
  countingType: string
  clickLookbackDays: number
  callSeconds: number
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const num = (v: unknown): number => {
  // int64 fields come back as STRINGS in the REST JSON — "30", not 30. A bare
  // === comparison against a number is then always false, which would report
  // every correctly-configured account as wrong.
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function readActions(rows: Record<string, unknown>[]): RawAction[] {
  return rows.map((row) => {
    const a = (row as { conversionAction?: Record<string, unknown> }).conversionAction || {}
    return {
      id: str(a.id),
      name: str(a.name),
      status: str(a.status),
      // `type` over the REST API; `type_` is what a protobuf client calls the
      // same field, and reading both costs nothing.
      type: str(a.type ?? (a as { type_?: unknown }).type_),
      category: str(a.category),
      origin: str(a.origin),
      countingType: str(a.countingType),
      clickLookbackDays: num(a.clickThroughLookbackWindowDays),
      callSeconds: num(a.phoneCallDurationSeconds),
    }
  })
}

/**
 * Compare one account against the standard.
 *
 * Reads only. Nothing here changes an account: an audit that fixes things is
 * an audit nobody can run to find out what is wrong.
 */
export async function auditConversionSetup(
  customerId: string,
  options: { offlineConversionActionId?: string | null } = {}
): Promise<{ ok: true; audit: ConversionAudit } | { ok: false; error: string }> {
  const listed = await adsSearch(
    customerId,
    `SELECT conversion_action.id,
            conversion_action.name,
            conversion_action.status,
            conversion_action.type,
            conversion_action.category,
            conversion_action.origin,
            conversion_action.counting_type,
            conversion_action.click_through_lookback_window_days,
            conversion_action.phone_call_duration_seconds
     FROM conversion_action`
  )
  if (!listed.ok) return listed

  // Biddability is set per CATEGORY~ORIGIN, so it is read from the goals
  // rather than the actions.
  const goals = await adsSearch(
    customerId,
    `SELECT customer_conversion_goal.category,
            customer_conversion_goal.origin,
            customer_conversion_goal.biddable
     FROM customer_conversion_goal`
  )

  return {
    ok: true,
    audit: compareToStandard(customerId, listed.rows, goals.ok ? goals.rows : null, options),
  }
}

/**
 * The comparison itself, with no network in it.
 *
 * Separate from the fetch so it can be run against a saved copy of a real
 * account's rows. Every rule below — the rename-don't-recreate matching, the
 * string-typed integers, the omitted `biddable` — came from reading live
 * accounts, and a pure function is the only way to keep proving that without
 * credentials.
 */
export function compareToStandard(
  customerId: string,
  actionRows: Record<string, unknown>[],
  goalRows: Record<string, unknown>[] | null,
  options: { offlineConversionActionId?: string | null } = {}
): ConversionAudit {
  const all = readActions(actionRows)
  // Matching only ever considers ENABLED actions: telling someone to rename a
  // paused action is telling them to rename a thing that counts nothing.
  // The checks further down read `all`, because a DORMANT GA4 import is worth
  // seeing before somebody switches it on.
  const actions = all.filter((a) => a.status === 'ENABLED')
  const claimed = new Set<string>()

  const findings: ConversionFinding[] = CONVERSION_STANDARD.map((spec) => {
    const base = {
      key: spec.key,
      name: spec.name,
      differences: [] as string[],
      setup: spec.setup,
      fires: spec.fires,
    }

    const byName = actions.filter((a) => a.name.trim().toLowerCase() === spec.name.toLowerCase())
    const byShape = actions.filter(
      (a) => a.category === spec.category && a.type === spec.type && !claimed.has(a.id)
    )

    const matched = byName[0] || (byShape.length === 1 ? byShape[0] : null)
    if (!matched) {
      if (byShape.length > 1) {
        return {
          ...base,
          state: 'duplicate' as const,
          fix: `${byShape.length} actions of this kind are enabled (${byShape
            .map((a) => a.name)
            .join(', ')}). Keep the one with the history, rename it "${spec.name}", and pause the rest — pausing keeps their past conversions in the reports.`,
        }
      }
      return {
        ...base,
        state: 'missing' as const,
        fix: `Create it: ${spec.setup[0]}`,
      }
    }

    claimed.add(matched.id)
    const differences: string[] = []
    if (matched.countingType !== spec.countingType) {
      differences.push(
        `Counts ${matched.countingType === 'MANY_PER_CLICK' ? 'every' : 'one'} — should be ${spec.countingType === 'ONE_PER_CLICK' ? 'One' : 'Every'}.`
      )
    }
    if (matched.clickLookbackDays !== spec.clickLookbackDays) {
      differences.push(
        `Click-through window is ${matched.clickLookbackDays} days — should be ${spec.clickLookbackDays}.`
      )
    }
    if (spec.callSeconds && matched.callSeconds !== spec.callSeconds) {
      differences.push(
        `Counts a call after ${matched.callSeconds}s — should be ${spec.callSeconds}s.`
      )
    }

    const named = matched.name.trim().toLowerCase() === spec.name.toLowerCase()
    if (!named) {
      return {
        ...base,
        state: 'rename' as const,
        actionId: matched.id,
        actionName: matched.name,
        differences,
        // Never "create one" — this IS the action, under the wrong name, and
        // it carries the history a new one would not.
        fix: `Rename "${matched.name}" to "${spec.name}". Do NOT create a second one — this action holds the conversion history and the bidding learning.`,
      }
    }

    return {
      ...base,
      state: differences.length ? ('settings' as const) : ('ok' as const),
      actionId: matched.id,
      actionName: matched.name,
      differences,
      fix: differences.length ? `Open ${spec.name} and correct: ${differences.join(' ')}` : undefined,
    }
  })

  const goalIssues: string[] = []
  if (goalRows) {
    const biddable = new Map<string, boolean>()
    for (const row of goalRows) {
      const g = (row as { customerConversionGoal?: Record<string, unknown> }).customerConversionGoal
      if (!g) continue
      // `biddable` is OMITTED when false — protobuf drops default values — so
      // a missing key means secondary, not unknown.
      biddable.set(`${str(g.category)}~${str(g.origin)}`, g.biddable === true)
    }
    for (const spec of CONVERSION_STANDARD) {
      const key = `${spec.category}~${spec.origin}`
      const is = biddable.get(key)
      if (is === undefined) continue
      if (is !== spec.biddable) {
        goalIssues.push(
          spec.biddable
            ? `${spec.name}: its goal (${key}) is Secondary — it should be Primary, or bidding ignores it.`
            : `${spec.name}: its goal (${key}) is Primary — it should be Secondary until this shop has the volume for value bidding.`
        )
      }
    }
  }

  const standardNames = new Set(CONVERSION_STANDARD.map((s) => s.name.toLowerCase()))
  const extras = actions
    .filter(
      (a) =>
        a.name.toUpperCase().startsWith(CONVERSION_PREFIX) &&
        !standardNames.has(a.name.trim().toLowerCase())
    )
    .map((a) => ({
      id: a.id,
      name: a.name,
      note: LEGACY_NAMES[a.name.trim()] || 'Not part of the standard set. Check what still writes to it before touching it.',
    }))

  // The app's own end of the loop: the upload target has to BE the sale
  // action, or booked jobs are uploaded somewhere the standard says nothing
  // about — which is how a shop ends up with a perfect Ads setup and an
  // attribution loop wired to the wrong action.
  const sale = findings.find((f) => f.key === 'sale')
  if (options.offlineConversionActionId !== undefined) {
    const target = options.offlineConversionActionId
    if (!target) {
      goalIssues.push(
        'This client has no offline conversion action selected in the app, so booked jobs upload nowhere. Set it to AGMP Sale on the Advertising tab.'
      )
    } else if (!sale?.actionId) {
      // The case that would otherwise pass silently: the upload is wired to
      // SOMETHING, so nothing looks broken, and it is not the action the
      // standard describes because that action does not exist yet.
      goalIssues.push(
        `The app uploads booked jobs to action ${target}, but AGMP Sale does not exist in this account yet. Create it, then point the upload at it.`
      )
    } else if (target !== sale.actionId) {
      goalIssues.push(
        `The app uploads booked jobs to action ${target}, which is not AGMP Sale (${sale.actionId}). Change it on the Advertising tab.`
      )
    }
  }

  /**
   * COUNTING THE SAME LEAD TWICE.
   *
   * Nothing in this app can create these — it uploads to one action id over
   * the Ads API and cannot reach Analytics at all. They arrive from a click
   * in the Google Ads UI: once a GA4 property is linked, Google offers to
   * import its events as conversion actions, and an imported "generate_lead"
   * or "purchase" is the SAME form submission the AGMP tag already reported.
   *
   * Two of them count it. Smart Bidding treats that as two wins and bids to
   * a number that does not exist, and it looks like performance improving.
   *
   * Both of these accounts already carry a GA4 import, dormant. Dormant is
   * fine and is reported as such; ENABLED and biddable is the failure.
   */
  const goalBiddable = new Map<string, boolean>()
  if (goalRows) {
    for (const row of goalRows) {
      const g = (row as { customerConversionGoal?: Record<string, unknown> }).customerConversionGoal
      if (g) goalBiddable.set(`${str(g.category)}~${str(g.origin)}`, g.biddable === true)
    }
  }

  const doubleCounting: string[] = []
  for (const action of all) {
    if (!/ANALYTICS/i.test(action.type)) continue
    const key = `${action.category}~${action.origin}`
    if (action.status !== 'ENABLED') {
      doubleCounting.push(
        `"${action.name}" is a GA4 import and is ${action.status.toLowerCase()} — leave it that way. Enabling it would count leads the AGMP actions already count.`
      )
    } else if (goalBiddable.get(key)) {
      doubleCounting.push(
        `"${action.name}" is a GA4 import, ENABLED, and its goal (${key}) is Primary — it is bidding on leads the AGMP actions already report. Set the goal Secondary, or pause the action.`
      )
    } else {
      doubleCounting.push(
        `"${action.name}" is a GA4 import and is enabled but Secondary — it is observed, not bid on. Acceptable; do not promote it.`
      )
    }
  }

  // HighLevel's uploads against this platform's own tracking. Both live and
  // both bidding is one event counted twice — and it is invisible in the Ads
  // UI, because the two actions sit in different categories and neither looks
  // like a duplicate of the other.
  for (const pair of LEGACY_PAIRS) {
    const legacy = all.find(
      (a) => a.name.trim().toLowerCase() === pair.legacy.toLowerCase() && a.status === 'ENABLED'
    )
    if (!legacy) continue
    const legacyBids = goalBiddable.get(`${legacy.category}~${legacy.origin}`) === true
    const replacement = findings.find((f) => f.key === pair.supersededBy)
    const replacementLive = !!replacement?.actionId
    const replacementBids =
      goalBiddable.get(
        `${CONVERSION_STANDARD.find((c) => c.key === pair.supersededBy)?.category}~${
          CONVERSION_STANDARD.find((c) => c.key === pair.supersededBy)?.origin
        }`
      ) === true

    if (legacyBids && replacementLive && replacementBids) {
      doubleCounting.push(
        `"${pair.legacy}" (HighLevel's upload) and "${replacement?.actionName || pair.supersededBy}" are both enabled and both bidding — one ${pair.event} counts twice. Keep whichever matches how this shop is actually tracked: HighLevel's number means ${pair.legacy}, a tracking number from this app means the other. Set the loser's goal to Secondary rather than removing it, so its history stays in the reports.`
      )
    } else if (legacyBids && !replacementLive) {
      doubleCounting.push(
        `"${pair.legacy}" is HighLevel's upload and is the only ${pair.event} conversion here — correct for a shop still on HighLevel tracking. When this shop moves to a tracking number from this app, this one goes Secondary as the other goes live.`
      )
    }
  }

  // The same trap without GA4 in it: any other live action sitting in a goal
  // this standard already owns counts the same event a second time.
  const standardKeys = new Set(CONVERSION_STANDARD.map((s) => `${s.category}~${s.origin}`))
  for (const action of actions) {
    if (claimed.has(action.id)) continue
    if (/ANALYTICS/i.test(action.type)) continue
    const key = `${action.category}~${action.origin}`
    if (!standardKeys.has(key)) continue
    if (!goalBiddable.get(key)) continue
    doubleCounting.push(
      `"${action.name}" is enabled in ${key}, the same goal as one of the AGMP actions, and that goal is Primary — check it is not reporting the same lead.`
    )
  }

  const clean =
    findings.every((f) => f.state === 'ok') &&
    goalIssues.length === 0 &&
    // A dormant GA4 import is a note, not a fault. Anything live in a goal we
    // already own is.
    !doubleCounting.some((d) => d.includes('ENABLED') || d.includes('is enabled in'))

  return { customerId, findings, goalIssues, extras, doubleCounting, clean }
}
