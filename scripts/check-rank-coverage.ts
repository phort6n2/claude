/**
 * Which clients get rank tracking, and does a client who does not get it ever
 * find out?
 *
 *   npx tsx scripts/check-rank-coverage.ts
 *
 * WHY THIS IS WORTH A SCRIPT. Rank tracking has no enable step: every client
 * is supposed to have a campaign and a daily sweep converges on that. The
 * whole feature therefore fails SILENTLY in one direction — a client who never
 * gets one produces no error, no empty state and no row. The sweep counted a
 * skip, the admin Rankings page simply did not list the client, the portal hid
 * its Rankings tab, and the SEO switch said "no campaign yet" whether that
 * meant "tomorrow" or "never".
 *
 * TWO SPECIFIC BUGS ARE PINNED HERE.
 *
 * 1. ONBOARDING WAS EXCLUDED. Every query in the rank module read
 *    `status: 'ACTIVE'`, and intake approval creates every new client as
 *    ONBOARDING — whose site is live and taking leads on purpose (see
 *    LIVE_STATUSES). So the normal way to onboard a shop was also the way to
 *    leave it untracked forever. This is the same mistake the WRHQ sync
 *    already recorded, in a second module.
 * 2. A BLOCKER HAD NO WORDS. "Cannot create" and "will be created tonight"
 *    are the whole difference to whoever is looking at the screen, and
 *    nothing told them apart.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import { rankSetupState, type RankSetupInput } from '@/lib/rank-campaigns'
import { LIVE_STATUSES } from '@/lib/site-preview'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const READY: RankSetupInput = {
  status: 'ACTIVE',
  googlePlaceId: 'ChIJ_mag_mobile',
  latitude: 33.66,
  longitude: -117.99,
  rankTrackingId: null,
  keyConfigured: true,
}

console.log('--- who is eligible ---')
{
  const ready = rankSetupState(READY)
  check('an active client with a Place ID can be created', ready.canCreate && !ready.hasCampaign)
  check('and has nothing to report', ready.problem === null, ready.problem || '')

  // THE BUG. ONBOARDING is live — those sites serve the public and take
  // leads — and intake approval makes every new client one.
  const onboarding = rankSetupState({ ...READY, status: 'ONBOARDING' })
  check('AN ONBOARDING CLIENT IS TRACKED', onboarding.canCreate, onboarding.problem || '')
  check(
    'and the rule is the same list the site uses',
    LIVE_STATUSES.includes('ONBOARDING') && LIVE_STATUSES.includes('ACTIVE'),
    JSON.stringify(LIVE_STATUSES)
  )

  // PAUSED is the kill switch and stays one, here as everywhere else.
  const paused = rankSetupState({ ...READY, status: 'PAUSED' })
  check('a PAUSED client is not tracked', !paused.canCreate)
  check('and it says so by name', /PAUSED/.test(paused.problem || ''), paused.problem || '')
  check(
    'and names where status is set',
    /Business tab/.test(paused.problem || ''),
    paused.problem || ''
  )
}

console.log('\n--- a client who already has one ---')
{
  const has = rankSetupState({ ...READY, rankTrackingId: 'scan_123' })
  check('is reported as having a campaign', has.hasCampaign)
  check('cannot create a second', !has.canCreate)
  check('and has no problem to report', has.problem === null)
  // Even PAUSED: the campaign exists, and saying "cannot create" about a
  // client who already has one would be a confident answer to the wrong
  // question.
  const pausedWithOne = rankSetupState({ ...READY, status: 'PAUSED', rankTrackingId: 'scan_123' })
  check('a paused client with a campaign still reads as having one', pausedWithOne.hasCampaign)
}

console.log('\n--- every blocker has words, and they name the fix ---')
{
  const noPlace = rankSetupState({ ...READY, googlePlaceId: null })
  check('no Business Profile blocks it', !noPlace.canCreate)
  check(
    'and says the grid is centred on it',
    /grid is centred/.test(noPlace.problem || ''),
    noPlace.problem || ''
  )
  check(
    'and where to link one',
    /Business tab/.test(noPlace.problem || ''),
    noPlace.problem || ''
  )

  const noKey = rankSetupState({ ...READY, keyConfigured: false })
  check('no API key blocks it', !noKey.canCreate)
  check(
    'and says it is every client, not this one',
    /every client/.test(noKey.problem || ''),
    noKey.problem || ''
  )
  check('and names the screen', /API keys/.test(noKey.problem || ''), noKey.problem || '')

  // NOT a blocker: the sweep backfills coordinates from the Place ID. It
  // still says so, because a press that then fails on coordinates would
  // otherwise be unexplainable from this screen.
  const noCoords = rankSetupState({ ...READY, latitude: null, longitude: null })
  check('missing coordinates do NOT block it', noCoords.canCreate)
  check(
    'and the note explains they are read from the profile',
    /read from the linked Business Profile/.test(noCoords.problem || ''),
    noCoords.problem || ''
  )
  const halfCoords = rankSetupState({ ...READY, longitude: null })
  check('one coordinate alone is treated as none', halfCoords.problem !== null)
}

console.log('\n--- the order of the blockers is the order of the fixes ---')
{
  // A paused client with no Place ID and no key should hear about the STATUS
  // first: it is the one that makes the other two irrelevant, and a list of
  // three things to fix is how an operator fixes none of them.
  const everything = rankSetupState({
    status: 'PAUSED',
    googlePlaceId: null,
    latitude: null,
    longitude: null,
    rankTrackingId: null,
    keyConfigured: false,
  })
  check('status wins over everything else', /PAUSED/.test(everything.problem || ''), everything.problem || '')
  const noKeyNoPlace = rankSetupState({ ...READY, keyConfigured: false, googlePlaceId: null })
  check(
    'a missing key wins over a missing profile, because it is one fix for all fifteen',
    /API keys/.test(noKeyNoPlace.problem || ''),
    noKeyNoPlace.problem || ''
  )
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
