/**
 * The campaign-goal check, against the account that produced it.
 *
 *   npx tsx scripts/check-campaign-goals.ts
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real function and exits non-zero when it is wrong.
 *
 * THE ROWS BELOW ARE REAL. They were read out of Auto Glass Kings
 * (customer 316-596-9925) on 2026-09-04, and they are the reason this check
 * exists: all four live campaigns sit at goal_config_level CAMPAIGN and bid
 * on PHONE_CALL_LEAD~CALL_FROM_ADS, CONTACT~CALL_FROM_ADS and
 * CONVERTED_LEAD~WEBSITE — while `AGMP Lead Form` (SUBMIT_LEAD_FORM~WEBSITE)
 * exists, is enabled, fires on every quote form on the hosted site, and is
 * Secondary on every one of them. The account-level conversion audit passes
 * that account with nothing to say, because the customer goal is only what a
 * campaign inherits IF it inherits anything.
 *
 * Two casings are exercised. The app reads Google over REST, which is
 * camelCase; these rows were captured through a protobuf client, which is
 * snake_case. A reader that understands only one of them sees an empty
 * account and reports every campaign as fine.
 */
import {
  evaluateCampaignGoals,
  type StandardActionRef,
} from '@/lib/google-ads-campaign-goals'

const LEAD_FORM: StandardActionRef = {
  key: 'lead-form',
  name: 'AGMP Lead Form',
  goalKey: 'SUBMIT_LEAD_FORM~WEBSITE',
  shouldBid: true,
  actionId: '7748136217',
}
const WEBSITE_CALL: StandardActionRef = {
  key: 'website-call',
  name: 'AGMP Website Call',
  goalKey: 'PHONE_CALL_LEAD~WEBSITE',
  shouldBid: true,
  actionId: '7748136300',
}
const CALL_FROM_ADS: StandardActionRef = {
  key: 'call-from-ads',
  name: 'AGMP Call From Ads',
  goalKey: 'PHONE_CALL_LEAD~CALL_FROM_ADS',
  shouldBid: true,
  actionId: '7073468340',
}
const SALE: StandardActionRef = {
  key: 'sale',
  name: 'AGMP Sale',
  goalKey: 'PURCHASE~WEBSITE',
  shouldBid: false,
  actionId: '7748140000',
}

/** snake_case, exactly as the live account returned them. */
const AGK_CONFIG = [
  {
    campaign: {
      resource_name: 'customers/3165969925/campaigns/22863484502',
      advertising_channel_type: 'SEARCH',
      name: 'AGMP Lead Gen',
      id: '22863484502',
    },
    conversion_goal_campaign_config: {
      campaign: 'customers/3165969925/campaigns/22863484502',
      goal_config_level: 'CAMPAIGN',
    },
  },
  {
    campaign: {
      resource_name: 'customers/3165969925/campaigns/22874534569',
      advertising_channel_type: 'PERFORMANCE_MAX',
      name: 'AGMP PMAX',
      id: '22874534569',
    },
    conversion_goal_campaign_config: {
      campaign: 'customers/3165969925/campaigns/22874534569',
      goal_config_level: 'CAMPAIGN',
    },
  },
]

const AGK_CAMPAIGN_GOALS = [
  ['22863484502', 'PHONE_CALL_LEAD', 'CALL_FROM_ADS'],
  ['22863484502', 'CONTACT', 'CALL_FROM_ADS'],
  ['22863484502', 'CONVERTED_LEAD', 'WEBSITE'],
  ['22874534569', 'PHONE_CALL_LEAD', 'CALL_FROM_ADS'],
  ['22874534569', 'CONTACT', 'CALL_FROM_ADS'],
  ['22874534569', 'CONVERTED_LEAD', 'WEBSITE'],
].map(([id, category, origin]) => ({
  campaign_conversion_goal: {
    campaign: `customers/3165969925/campaigns/${id}`,
    category,
    origin,
    biddable: true,
  },
}))

let bad = 0
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) bad += 1
}

// ---------------------------------------------------------------------------
// 1. The live account, read as it came back.
// ---------------------------------------------------------------------------
const live = evaluateCampaignGoals({
  refs: [LEAD_FORM, CALL_FROM_ADS],
  configRows: AGK_CONFIG,
  campaignGoalRows: AGK_CAMPAIGN_GOALS,
  customerGoalRows: [],
})
check('both live campaigns are read', live.campaigns.length === 2, `${live.campaigns.length}`)
check(
  'both are flagged',
  live.problems.length === 2,
  live.problems.map((p) => p.name).join(', ')
)
check(
  'AGMP Lead Form is the thing ignored',
  live.campaigns.every((c) => c.ignored.join() === 'AGMP Lead Form'),
  live.campaigns.map((c) => `${c.name}: ${c.ignored.join('/') || 'none'}`).join(' | ')
)
check(
  'AGMP Call From Ads is credited as bidding',
  live.campaigns.every((c) => c.bidding.includes('AGMP Call From Ads'))
)
check(
  'the fix points at the campaign, not the account default',
  live.campaigns.every((c) => c.level === 'CAMPAIGN' && /Campaign → Settings/.test(c.problem || ''))
)

// ---------------------------------------------------------------------------
// 2. The same account in REST casing — the shape the app actually receives.
// ---------------------------------------------------------------------------
const camel = evaluateCampaignGoals({
  refs: [LEAD_FORM, CALL_FROM_ADS],
  configRows: [
    {
      campaign: { id: '22863484502', name: 'AGMP Lead Gen', advertisingChannelType: 'SEARCH' },
      conversionGoalCampaignConfig: {
        campaign: 'customers/3165969925/campaigns/22863484502',
        goalConfigLevel: 'CAMPAIGN',
      },
    },
  ],
  campaignGoalRows: [
    {
      campaignConversionGoal: {
        campaign: 'customers/3165969925/campaigns/22863484502',
        category: 'PHONE_CALL_LEAD',
        origin: 'CALL_FROM_ADS',
        biddable: true,
      },
    },
  ],
  customerGoalRows: [],
})
check(
  'REST casing reads the same account the same way',
  camel.problems.length === 1 && camel.campaigns[0].ignored.join() === 'AGMP Lead Form',
  JSON.stringify(camel.campaigns[0]?.ignored)
)

// ---------------------------------------------------------------------------
// 3. A campaign that inherits the account defaults.
// ---------------------------------------------------------------------------
const inherits = (biddableKeys: string[]) =>
  evaluateCampaignGoals({
    refs: [LEAD_FORM, CALL_FROM_ADS],
    configRows: [
      {
        campaign: { id: '1', name: 'Inheriting', advertisingChannelType: 'SEARCH' },
        conversionGoalCampaignConfig: { campaign: 'x/1', goalConfigLevel: 'CUSTOMER' },
      },
    ],
    campaignGoalRows: [],
    customerGoalRows: biddableKeys.map((k) => ({
      customerConversionGoal: {
        category: k.split('~')[0],
        origin: k.split('~')[1],
        biddable: true,
      },
    })),
  })

check(
  'inheriting a good account default is clean',
  inherits(['SUBMIT_LEAD_FORM~WEBSITE', 'PHONE_CALL_LEAD~CALL_FROM_ADS']).ok
)
const inheritsBad = inherits(['PHONE_CALL_LEAD~CALL_FROM_ADS'])
check(
  'inheriting a Secondary default is flagged, and the fix names the account',
  inheritsBad.problems.length === 1 &&
    /Goals → Conversions → Settings/.test(inheritsBad.problems[0].problem || ''),
  inheritsBad.problems[0]?.problem || ''
)

// `biddable` is OMITTED when false — a row present but without the key must
// read as Secondary, not as unknown-so-assume-fine.
const omitted = evaluateCampaignGoals({
  refs: [LEAD_FORM],
  configRows: [
    {
      campaign: { id: '1', name: 'Omitted', advertisingChannelType: 'SEARCH' },
      conversionGoalCampaignConfig: { campaign: 'x/1', goalConfigLevel: 'CAMPAIGN' },
    },
  ],
  campaignGoalRows: [
    {
      campaignConversionGoal: {
        campaign: 'x/1',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE',
      },
    },
  ],
  customerGoalRows: [],
})
check('an omitted `biddable` reads as Secondary', omitted.problems.length === 1)

// ---------------------------------------------------------------------------
// 4. The things that must NOT be reported.
// ---------------------------------------------------------------------------
const missingAction = evaluateCampaignGoals({
  refs: [],
  configRows: AGK_CONFIG,
  campaignGoalRows: AGK_CAMPAIGN_GOALS,
  customerGoalRows: [],
})
check(
  'an account with none of the four says so instead of blaming campaigns',
  missingAction.ok && !!missingAction.note,
  missingAction.note || ''
)

const saleQuiet = evaluateCampaignGoals({
  refs: [SALE, CALL_FROM_ADS],
  configRows: AGK_CONFIG,
  campaignGoalRows: AGK_CAMPAIGN_GOALS,
  customerGoalRows: [],
})
check('AGMP Sale being Secondary is correct, not a finding', saleQuiet.ok)

const salePrimary = evaluateCampaignGoals({
  refs: [SALE],
  configRows: [
    {
      campaign: { id: '1', name: 'Value bidder', advertisingChannelType: 'SEARCH' },
      conversionGoalCampaignConfig: { campaign: 'x/1', goalConfigLevel: 'CAMPAIGN' },
    },
  ],
  campaignGoalRows: [
    {
      campaignConversionGoal: {
        campaign: 'x/1',
        category: 'PURCHASE',
        origin: 'WEBSITE',
        biddable: true,
      },
    },
  ],
  customerGoalRows: [],
})
check(
  'AGMP Sale bidding early IS a finding',
  salePrimary.problems.length === 1 && salePrimary.problems[0].premature.join() === 'AGMP Sale'
)

// ---------------------------------------------------------------------------
// 5. Custom goals name ACTIONS, not categories.
// ---------------------------------------------------------------------------
const customConfig = [
  {
    campaign: { id: '1', name: 'Custom goal', advertisingChannelType: 'SEARCH' },
    conversionGoalCampaignConfig: {
      campaign: 'x/1',
      goalConfigLevel: 'CAMPAIGN',
      customConversionGoal: 'customers/3165969925/customConversionGoals/55',
    },
  },
]
const customIn = evaluateCampaignGoals({
  refs: [LEAD_FORM, WEBSITE_CALL],
  configRows: customConfig,
  campaignGoalRows: [],
  customerGoalRows: [],
  customGoalRows: [
    {
      customConversionGoal: {
        id: '55',
        name: 'Calls only',
        conversionActions: ['customers/3165969925/conversionActions/7748136300'],
      },
    },
  ],
})
check(
  'a custom goal is judged by which actions it names',
  customIn.problems.length === 1 &&
    customIn.campaigns[0].ignored.join() === 'AGMP Lead Form' &&
    customIn.campaigns[0].bidding.join() === 'AGMP Website Call',
  `${customIn.campaigns[0]?.bidding.join('/')} vs ${customIn.campaigns[0]?.ignored.join('/')}`
)

const customUnknown = evaluateCampaignGoals({
  refs: [LEAD_FORM],
  configRows: customConfig,
  campaignGoalRows: [],
  customerGoalRows: [],
})
check(
  'an unreadable custom goal is reported as unknown, never as fine',
  customUnknown.problems.length === 1 && /could not be read/.test(customUnknown.problems[0].problem || '')
)

console.log(bad === 0 ? '\nAll campaign-goal cases pass.' : `\n${bad} case(s) wrong.`)
process.exit(bad === 0 ? 0 : 1)
