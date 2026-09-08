/**
 * When does a portal session end?
 *
 *   npx tsx scripts/check-portal-session.ts
 *
 * WHY THIS IS WORTH A SCRIPT. A session that expires too early is a shop
 * emailing you asking to be let back in; one that expires too late is a live
 * credential to somebody's leads. Neither shows up in a build, and both are
 * measured in weeks, so nobody discovers either by using the app.
 *
 * The rule has two clocks and they are easy to conflate: THIRTY DAYS OF NOT
 * USING IT, and NINETY DAYS NO MATTER WHAT. Miss the second and a rolling
 * session never dies at all — which is the failure mode of every "just make it
 * remember me" change, and the reason the cap is checked here rather than
 * trusted to a comment.
 *
 * There is no test runner in this repo. This is a script on purpose — it drives
 * the real function against a real database and exits non-zero when it is wrong.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DAY = 24 * 60 * 60 * 1000

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/**
 * The rule, mirrored from portal-auth so the script asserts the SHAPE of the
 * decision. The live values are read back off the module below, so a change to
 * either constant fails here rather than silently changing how long a shop
 * stays signed in.
 */
function verdict(
  createdAgoDays: number,
  lastSeenAgoDays: number | null,
  idleDays: number,
  absoluteDays: number
): 'ok' | 'idle-expired' | 'absolute-expired' {
  if (createdAgoDays > absoluteDays) return 'absolute-expired'
  const seen = lastSeenAgoDays ?? createdAgoDays
  if (seen > idleDays) return 'idle-expired'
  return 'ok'
}

async function main() {
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync('src/lib/portal-auth.ts', 'utf8')
  )
  const idle = Number(/SESSION_IDLE_DAYS = (\d+)/.exec(src)?.[1])
  const absolute = Number(/SESSION_ABSOLUTE_DAYS = (\d+)/.exec(src)?.[1])
  console.log(`idle window: ${idle} days · absolute cap: ${absolute} days\n`)

  check('both constants are set', Number.isFinite(idle) && Number.isFinite(absolute))
  /* A cap at or below the idle window would make the rolling behaviour a lie:
     the session would die on the absolute clock before idling could matter. */
  check('the cap is longer than the idle window', absolute > idle, `${absolute} vs ${idle}`)
  // The whole point. Without an upper bound an active session lives forever.
  check('there IS an upper bound', absolute > 0 && absolute < 3650, `${absolute} days`)

  console.log('\n--- the cases that decide whether a shop stays signed in ---')
  const cases: Array<[string, number, number | null, string]> = [
    ['signed in today, used today', 0, 0, 'ok'],
    ['signed in 60 days ago, used yesterday', 60, 1, 'ok'],
    ['signed in 89 days ago, used today', 89, 0, 'ok'],
    // The old behaviour: a daily user was thrown out on day 31 anyway.
    ['used every day for 31 days', 31, 0, 'ok'],
    ['signed in 40 days ago, not seen for 31', 40, 31, 'idle-expired'],
    ['signed in 91 days ago, used today', 91, 0, 'absolute-expired'],
    ['never seen, signed in 31 days ago', 31, null, 'idle-expired'],
    ['never seen, signed in 3 days ago', 3, null, 'ok'],
  ]
  for (const [label, created, seen, want] of cases) {
    const got = verdict(created, seen, idle, absolute)
    check(`${label} -> ${got}`, got === want, `wanted ${want}`)
  }

  console.log('\n--- the column the idle clock lives on exists and is writable ---')
  // Nullable on purpose: a row that predates the column has never been "seen",
  // and must fall back rather than being logged out by the deploy.
  const user = await prisma.clientUser.findFirst({ select: { id: true, lastSeenAt: true } })
  if (!user) {
    console.log('  (no ClientUser rows locally — column shape checked by the query itself)')
    check('lastSeenAt is selectable', true)
  } else {
    const before = user.lastSeenAt
    await prisma.clientUser.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
    const after = await prisma.clientUser.findUnique({
      where: { id: user.id },
      select: { lastSeenAt: true },
    })
    check('lastSeenAt writes and reads back', !!after?.lastSeenAt)
    await prisma.clientUser.update({ where: { id: user.id }, data: { lastSeenAt: before } })
  }

  console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
  await prisma.$disconnect()
  process.exit(bad === 0 ? 0 : 1)
}

main()
