import { adsSearch } from '@/lib/google-ads'
import { CONVERSION_NAMES, CONVERSION_PREFIX } from '@/lib/google-ads-conversion-names'
// The steps live in a leaf module so the Advertising tab can render them;
// see the note there about the abbreviated copy the card used to write.
import { CONVERSION_SETUP } from '@/lib/google-ads-conversion-setup'

/**
 * ONE conversion setup, identical in every client's Google Ads account.
 *
 * The problem this solves is not tidiness. Every account was set up by
 * whoever happened to be doing it that week, so the same event is called
 * "Calls from ads" in one account and "Call from Ads" in the next, counts a
 * call after 60 seconds here and 10 there, and looks back 30 days in one
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
    setup: CONVERSION_SETUP.leadForm,
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
    // 10, not Google's default 15. These are low-volume local accounts where
    // Smart Bidding is starved of conversions long before it is fooled by a
    // bad one, and a real auto-glass enquiry is often over in fifteen seconds
    // — year, make, model, "can you do Tuesday". The cost is that a few
    // wrong numbers get counted; the benefit is enough countable calls for
    // bidding to learn from at all. Set deliberately; do not "correct" it
    // back to 15.
    callSeconds: 10,
    biddable: true,
    setup: CONVERSION_SETUP.callFromAds,
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
    // The same 10 seconds as the call-from-ads action above, and for the same
    // reason — the two must agree, or one inbound call counts differently
    // depending on which way it arrived.
    callSeconds: 10,
    biddable: true,
    setup: CONVERSION_SETUP.websiteCall,
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
    setup: CONVERSION_SETUP.sale,
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
  /**
   * The ACTION's own bidding switch. False takes it out of bidding whatever
   * the goal says, so anything reasoning about what drives Smart Bidding
   * needs this alongside the goal — see the note at the goal comparison.
   */
  primaryForGoal?: boolean
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
  /**
   * Account-level plumbing that decides whether an action ever fires, as
   * opposed to whether it is set up right. Kept apart from goalIssues because
   * it is fixed on a different screen — Goals → Conversions → Settings.
   */
  accountSettings: string[]
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
  /**
   * The ACTION's own bidding switch, which is not the goal's.
   *
   * `false` takes the action out of bidding whatever its goal says — Google's
   * words: "not biddable for all campaigns regardless of their customer
   * conversion goal or campaign conversion goal". Omitted means true, the
   * usual protobuf-drops-defaults rule that `biddable` already needs going the
   * other way.
   */
  primaryForGoal: boolean
  /**
   * Whether Google counts this action in the "Conversions" column, as opposed
   * to "All conversions" only.
   *
   * Read for ONE purpose: to corroborate a finding in words the operator can
   * check in two seconds on the screen they are already looking at. Across all
   * thirteen live actions in the account this was written against, it equalled
   * `goal biddable && primary_for_goal` exactly — Google's own derived answer
   * to the same question this audit computes. It is quoted, never trusted as
   * the source: it was independently settable in older accounts, so a
   * disagreement is a curiosity rather than a verdict, and the verdict stays
   * with the two switches that actually decide bidding.
   */
  countedInConversions: boolean
}

/**
 * A goal key in the words the Google Ads interface uses for it.
 *
 * `PHONE_CALL_LEAD~CALL_FROM_ADS` is not a string anybody can search for in
 * the UI, and a finding that only names the enum sends the operator looking
 * for a word that is not on any screen.
 */
export function goalLabel(category: string, origin: string): string {
  const categories: Record<string, string> = {
    SUBMIT_LEAD_FORM: 'Submit lead form',
    PHONE_CALL_LEAD: 'Phone call leads',
    PURCHASE: 'Purchases',
    CONTACT: 'Contact',
    CONVERTED_LEAD: 'Converted lead',
    REQUEST_QUOTE: 'Request quote',
    BOOK_APPOINTMENT: 'Book appointment',
  }
  const origins: Record<string, string> = {
    WEBSITE: 'website',
    CALL_FROM_ADS: 'calls from ads',
    GOOGLE_HOSTED: 'Google-hosted',
    STORE: 'store',
    APP: 'app',
  }
  // Unknown enums fall through to the raw value rather than to a blank: a
  // category Google adds next year must still produce a readable sentence.
  const name = categories[category] || category
  const where = origins[origin] || origin
  return `"${name}" (${where})`
}

/**
 * Where an account-default goal is changed.
 *
 * The GROUPING is named as well as the menu item, because menu wording moves
 * and the two-column split does not — a finding whose only instruction is a
 * label that has since been renamed is a finding nobody can act on.
 */
const ACCOUNT_GOAL_SCREEN =
  'Goals → Conversions → Summary, where it is listed under "Other available goals" rather than "Account-default goals"'

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/**
 * The digits of a conversion tracking id, however it is spelled.
 *
 * The same account is written `AW-715255323` in a pasted snippet and
 * `"715255323"` by the API — and the API returns it as a STRING, the int64
 * rule this file already records for the lookback windows. Comparing the two
 * forms directly is always false, which would report every correctly-tagged
 * site as tagged for the wrong account.
 */
const digitsOf = (v: unknown): string => str(v).replace(/\D/g, '')
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
      // Omitted means TRUE here, the opposite default from `biddable`: false
      // is the non-default value, so it is the one protobuf actually sends.
      primaryForGoal: (a.primaryForGoal ?? (a as { primary_for_goal?: unknown }).primary_for_goal) !== false,
      // Omitted means TRUE, the same direction as primaryForGoal: an action
      // excluded from the Conversions column is the non-default state.
      countedInConversions:
        (a.includeInConversionsMetric ??
          (a as { include_in_conversions_metric?: unknown }).include_in_conversions_metric) !==
        false,
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
  options: {
    offlineConversionActionId?: string | null
    /** The `AW-…` this client's SITE is tagged with, so the audit can say
     *  whether the website reports to the account it is reading. */
    siteConversionId?: string | null
  } = {}
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
            conversion_action.phone_call_duration_seconds,
            conversion_action.primary_for_goal,
            conversion_action.include_in_conversions_metric
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

  /**
   * WHICH ACTION A CALL FROM AN AD REPORTS TO.
   *
   * Goals → Conversions → Settings → "Call conversion action", and it is
   * account-level: every call asset that has not been given its own action
   * reports to whatever is named here. Nothing in the conversion list shows
   * it — an account can have all four actions, perfectly configured, and be
   * sending every call from every ad to a different action entirely, or to
   * Google's own default one, and the Conversions summary looks fine.
   *
   * Found because an operator went looking through the Ads UI and came across
   * a settings page nobody had opened.
   */
  /* The conversion TRACKING id rides along on the same `customer` row, so it
     costs nothing extra. It is the number in the `AW-…` the site's tag
     carries, which is the only readable link between the account this audit
     is reading and the account the website is actually reporting to. See the
     check that uses it. */
  const callSetting = await adsSearch(
    customerId,
    `SELECT customer.call_reporting_setting.call_reporting_enabled,
            customer.call_reporting_setting.call_conversion_reporting_enabled,
            customer.call_reporting_setting.call_conversion_action,
            customer.conversion_tracking_setting.conversion_tracking_id,
            customer.conversion_tracking_setting.cross_account_conversion_tracking_id,
            customer.conversion_tracking_setting.conversion_tracking_status
     FROM customer`
  )

  return {
    ok: true,
    audit: compareToStandard(customerId, listed.rows, goals.ok ? goals.rows : null, {
      ...options,
      callSettingRows: callSetting.ok ? callSetting.rows : null,
    }),
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
  options: {
    offlineConversionActionId?: string | null
    /** The `customer` row carrying call_reporting_setting, when it was read. */
    callSettingRows?: Record<string, unknown>[] | null
    /**
     * The `AW-…` this client's SITE is tagged with — `ClientAdsTracking
     * .conversionId`, as pasted from a snippet. Given, the audit can say
     * whether the website reports to the account it is reading.
     */
    siteConversionId?: string | null
  } = {}
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
      primaryForGoal: matched.primaryForGoal,
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
    /* TWO SWITCHES, AND READING ONLY ONE OF THEM MADE A FALSE CLAIM.
       Biddability is per CATEGORY~ORIGIN goal, which is why the goals are read
       at all — but the ACTION carries its own `primary_for_goal`, and Google is
       explicit that false there takes the action out of bidding "regardless of
       their customer conversion goal or campaign conversion goal". So an
       account can have PURCHASE~WEBSITE biddable and AGMP Sale still excluded,
       which is exactly what the Ads UI shows when somebody sets that action to
       Secondary. This reported the goal and NAMED THE ACTION — "AGMP Sale …
       should be Secondary" about an action that already was, which is the
       queue telling an operator to undo something they had done correctly.

       The question is therefore whether the ACTION drives bidding, which needs
       both to be true. (The documented exception is a campaign using a CUSTOM
       conversion goal, which ignores `primary_for_goal`; campaign-level goals
       are audited separately in google-ads-campaign-goals.ts.) */
    for (const spec of CONVERSION_STANDARD) {
      const key = `${spec.category}~${spec.origin}`
      const goalBiddable = biddable.get(key)
      if (goalBiddable === undefined) continue
      const matched = actions.find((a) => a.name.trim().toLowerCase() === spec.name.toLowerCase())
      // No action to speak about: the goal alone says nothing an operator can
      // act on, and the missing action is already reported above.
      if (!matched) continue
      const drivesBidding = goalBiddable && matched.primaryForGoal

      if (spec.biddable && !drivesBidding) {
        /* THE FINDING HAS TO SURVIVE THE OPERATOR OPENING THE SCREEN IT IS
           ABOUT, and the first version of this did not. "its goal
           (PHONE_CALL_LEAD~CALL_FROM_ADS) is Secondary" is TRUE — verified
           against AGS's live account, where both call goals are non-biddable
           at customer level and on all six enabled campaigns — but the
           operator's next move is to open the conversion actions table, where
           the row for that very action reads "Primary action", because
           `primary_for_goal` is a DIFFERENT switch and it is set correctly.
           One line saying Secondary, one screen saying Primary, and the
           report is the thing that looks broken. It was reported as a bug.

           So the sentence names which of the two switches it means BEFORE the
           operator can find the one that contradicts it, says the action is
           right and should be left alone, and names the screen where the goal
           actually lives — which is not the one the action is on. */
        const label = goalLabel(spec.category, spec.origin)
        const counted = matched.countedInConversions
          ? ''
          : ` Google is already showing this: ${spec.name} is excluded from the Conversions column and counted under All conversions only.`
        goalIssues.push(
          matched.primaryForGoal
            ? `${spec.name}: bidding ignores it — and NOT because of the action, which is set to Primary and should stay that way. ` +
              `Its GOAL, ${label}, is not an account-default goal here, and the goal is the switch Smart Bidding reads. ` +
              `Set it as an account-default goal in ${ACCOUNT_GOAL_SCREEN} (${key}).${counted}`
            : `${spec.name}: the ACTION itself is set to Secondary, which takes it out of bidding whatever its goal says. ` +
              `Open the action — Goals → Conversions → ${spec.name} → mark it as a primary action. ` +
              `Its goal, ${label}, is not the problem here.${counted}`
        )
      } else if (!spec.biddable && drivesBidding) {
        goalIssues.push(
          `${spec.name}: it is driving bidding — its goal (${key}) is Primary and the action is Primary. ` +
            `Set the ACTION to Secondary until this shop has the volume for value bidding; leaving the goal alone keeps the other actions in it biddable.`
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

  /**
   * WHERE A CALL FROM AN AD ACTUALLY LANDS.
   *
   * Goals → Conversions → Settings → "Call conversion action" names the
   * action every call asset reports to unless it has been given its own. It
   * is account-level and invisible from the conversion list, so an account
   * can hold all four actions, correctly configured, and still be sending
   * every call from every ad somewhere else — or to Google's own default
   * action, which no report of ours knows about.
   *
   * The check is quiet in two cases on purpose. When the account has no
   * call-from-ads action at all, the finding above already says "missing" and
   * repeating it here is a second line about one absence. And when the
   * setting points at the RIGHT action under the wrong name, the rename
   * finding covers it — the setting itself is correct, and it follows the
   * action through a rename.
   */
  const accountSettings: string[] = []
  const callSpec = CONVERSION_STANDARD.find((s) => s.key === 'call-from-ads')
  const callFinding = findings.find((f) => f.key === 'call-from-ads')
  const callRow = options.callSettingRows?.[0]
  if (callRow && callSpec && callFinding?.actionId) {
    const setting =
      ((callRow as { customer?: Record<string, unknown> }).customer as
        | Record<string, unknown>
        | undefined)?.callReportingSetting as Record<string, unknown> | undefined
    // Both flags are omitted when false — the same protobuf rule as `biddable`.
    const reporting = setting?.callConversionReportingEnabled === true
    const chosen = str(setting?.callConversionAction).split('/').pop() || ''

    if (!reporting) {
      accountSettings.push(
        `Call conversion reporting is OFF for this account, so nothing a call asset produces reaches ${callSpec.name}. Turn it on at Goals → Conversions → Settings.`
      )
    } else if (!chosen) {
      accountSettings.push(
        `No call conversion action is set for the account, so calls from ads report to Google's default action instead of ${callSpec.name} — and nothing in this app or your reports counts them. Set it at Goals → Conversions → Settings → Call conversion action.`
      )
    } else if (chosen !== callFinding.actionId) {
      const other = all.find((a) => a.id === chosen)
      accountSettings.push(
        `Calls from ads are reporting to ${other ? `"${other.name}"` : `action ${chosen}`}, not ${callSpec.name} (${callFinding.actionId}). Change it at Goals → Conversions → Settings → Call conversion action.`
      )
    }
  }

  /**
   * IS THE WEBSITE EVEN REPORTING TO THIS ACCOUNT?
   *
   * `ClientAdsTracking` holds TWO names for one account — the customer id
   * picked from a dropdown, and the `AW-…` that arrived inside a pasted
   * snippet — and NOTHING made them agree. A shop whose account is replaced
   * (it happens: a suspension, a billing mess, an agency handover) gets the
   * new customer id set on the card, while the conversion snippets from the
   * OLD account stay exactly where they were. The site then tags for an
   * account nobody is looking at, and every form lead and website call it
   * reports lands there: this audit, the landing-page check, the offline
   * upload and the monthly report's cost per conversion all interrogate the
   * NEW account and find a tidy, correct, empty setup. Nothing errors, the
   * tag loads, the page looks right.
   *
   * The only thing that ever noticed was the one-account rule in the save
   * route, when an operator pasting the new lead snippet was refused by the
   * old call conversion sitting beside it — which reads as the app being
   * broken rather than as the app catching a half-finished account move.
   *
   * `conversion_tracking_setting.conversion_tracking_id` IS that number:
   * checked against a live account, customer 6109211627 answers 715255323,
   * which is the `AW-715255323` its site carries. So this is provable rather
   * than inferred.
   *
   * CROSS-ACCOUNT CONVERSION TRACKING IS THE LEGITIMATE EXCEPTION and firing
   * on it would be a confident finding about a correct setup. An account whose
   * conversions are managed by its manager reports to the MANAGER's id, which
   * arrives as `cross_account_conversion_tracking_id`. Either id is accepted.
   * Both keys are OMITTED when they do not apply — the same
   * protobuf-drops-defaults rule `biddable` and `primary_for_goal` already
   * need — so a missing one is "not this" and never "unknown", and an account
   * that returns NEITHER is not judged at all.
   */
  const siteTag = digitsOf(options.siteConversionId)
  if (siteTag) {
    const tracking = (callRow as { customer?: Record<string, unknown> } | undefined)?.customer as
      | Record<string, unknown>
      | undefined
    // REST answers camelCase; rows captured from a protobuf client are
    // snake_case, and a reader that knows only one of them sees an account
    // with no tracking id and stays silent about a real mismatch.
    const setting = (tracking?.conversionTrackingSetting ??
      tracking?.conversion_tracking_setting) as Record<string, unknown> | undefined
    const own = digitsOf(setting?.conversionTrackingId ?? setting?.conversion_tracking_id)
    const cross = digitsOf(
      setting?.crossAccountConversionTrackingId ?? setting?.cross_account_conversion_tracking_id
    )
    const accepted = [own, cross].filter(Boolean)

    // No readable id at all: say nothing. An account that has never had a
    // conversion action returns none, and "your tag is wrong" about that is a
    // finding nobody can act on.
    if (accepted.length && !accepted.includes(siteTag)) {
      const theirs = own ? `AW-${own}` : `AW-${cross}`
      accountSettings.push(
        `THE SITE IS TAGGED FOR A DIFFERENT ACCOUNT. Its conversion snippets report to AW-${siteTag}, ` +
          `but this account's conversion tracking id is ${theirs}. Every form lead and website call this ` +
          `site sends is landing in AW-${siteTag}, which is not the account audited here — so the actions ` +
          `above can all be correct and still receive nothing. Re-paste BOTH snippets from ${theirs} on the ` +
          `Advertising tab (both at once: a lead snippet on its own is refused while the old call conversion ` +
          `is still saved).`
      )
    }
  }

  const clean =
    findings.every((f) => f.state === 'ok') &&
    goalIssues.length === 0 &&
    accountSettings.length === 0 &&
    // A dormant GA4 import is a note, not a fault. Anything live in a goal we
    // already own is.
    !doubleCounting.some((d) => d.includes('ENABLED') || d.includes('is enabled in'))

  return { customerId, findings, goalIssues, accountSettings, extras, doubleCounting, clean }
}
