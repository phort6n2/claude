/**
 * Every statement array in schema-bootstrap.ts is actually APPLIED.
 *
 * Run: npx tsx scripts/check-schema-bootstrap.ts
 *
 * THIS FILE HAS ONE JOB AND ONE WAY TO SILENTLY NOT DO IT. There are no Prisma
 * migrations here: a schema change is idempotent SQL in a named array, and
 * `BOOTSTRAP_SQL` is the list the boot hook and `POST /api/admin/setup-db`
 * both run. Declaring the array and forgetting to spread it in compiles
 * cleanly, lints cleanly, passes every other check in this directory, and
 * deploys — because the only thing that would notice is a query against a
 * table that was never created.
 *
 * WHICH IS WHAT HAPPENED. `INSURANCE_PROGRAM_SQL` was written, reviewed,
 * committed in the same commit as the model exactly as the rule requires, and
 * never added to `BOOTSTRAP_SQL`. Everything local passed: the dev database
 * got the table from a script that ran the array directly, so the page
 * rendered, the sitemap listed it and the whole feature was verified against a
 * real render. In production the first press of Save answered 500 with
 * `P2021: The table public.ClientInsuranceProgram does not exist`. The gap
 * between "the SQL exists" and "the SQL runs" is invisible from inside the
 * file, and the local pass is worth nothing — the same shape as the DDL note
 * in CLAUDE.md, where a direct local connection hid a pooled-role failure for
 * weeks.
 *
 * So this is mechanical rather than a list somebody maintains: it reads the
 * module's own exports, so an array added tomorrow is covered without anybody
 * remembering this file exists.
 */

import * as bootstrap from '../src/lib/schema-bootstrap'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const isSqlArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string')

const applied = new Set(bootstrap.BOOTSTRAP_SQL)

console.log('\nEvery exported *_SQL array is spread into BOOTSTRAP_SQL')
{
  const arrays = Object.entries(bootstrap).filter(
    ([name, value]) => name.endsWith('_SQL') && name !== 'BOOTSTRAP_SQL' && isSqlArray(value)
  ) as Array<[string, string[]]>

  if (arrays.length < 10) {
    fail(`only found ${arrays.length} statement arrays — is the export shape still the same?`)
  } else pass(`found ${arrays.length} statement arrays`)

  for (const [name, statements] of arrays) {
    const missing = statements.filter((s) => !applied.has(s))
    if (missing.length === 0) pass(`${name} (${statements.length}) is applied`)
    else {
      fail(
        `${name} IS NEVER RUN — ${missing.length} of ${statements.length} statements are not in ` +
          `BOOTSTRAP_SQL. Add \`...${name},\` to it. First missing: ` +
          `${missing[0].replace(/\s+/g, ' ').slice(0, 90)}…`
      )
    }
  }
}

console.log('\nNothing in BOOTSTRAP_SQL is a duplicate')
{
  // A statement spread in twice is harmless (every one of these is idempotent)
  // but it is the signature of a copy-paste that meant to add a different
  // array, so it is worth seeing.
  const seen = new Set<string>()
  const dupes = bootstrap.BOOTSTRAP_SQL.filter((s) => {
    if (seen.has(s)) return true
    seen.add(s)
    return false
  })
  if (dupes.length === 0) pass(`${bootstrap.BOOTSTRAP_SQL.length} statements, no repeats`)
  else fail(`${dupes.length} repeated statements: ${dupes[0].replace(/\s+/g, ' ').slice(0, 80)}…`)
}

console.log('\nNo statement can ERROR on the second cold start')
{
  /* The whole design rests on re-running cleanly: the boot hook applies the
     list every time the server starts, so one statement that throws the second
     time turns every cold start into a logged error AND stops the statements
     after it from running — the newest table silently never gets created,
     which is the failure this whole file exists to prevent.
   *
   * THE TEST IS "DOES IT THROW", NOT "DOES IT LOOK GUARDED", and the
   * difference is real rather than pedantic. DDL throws on a second run unless
   * it says IF NOT EXISTS or sits in a DO block that swallows
   * duplicate_object. DML does not: `UPDATE … WHERE … AND "isTest" = false`
   * matches nothing the second time and succeeds, which is idempotent by
   * construction and needs no guard clause. A first cut of this check demanded
   * the guard WORDS and failed that UPDATE, which would have meant editing a
   * correct statement to satisfy a test — the tail wagging the dog. */
  const needsGuard = (sql: string): boolean => {
    const head = sql.trim().slice(0, 40).toUpperCase()
    // A DO block carries its own exception handling.
    if (head.startsWith('DO ')) return false
    // Re-running these cannot raise: they simply match nothing.
    if (/^(UPDATE|DELETE)\b/.test(head)) return false
    // An INSERT can violate a unique index, so it has to say what to do.
    if (head.startsWith('INSERT')) return !/ON CONFLICT/i.test(sql)
    // Everything left is DDL. A DROP guards with IF EXISTS, everything else
    // with IF NOT EXISTS — matching only the second wrongly failed a
    // perfectly guarded `DROP INDEX IF EXISTS`.
    if (head.startsWith('DROP')) return !/IF EXISTS/i.test(sql)
    return !(/IF NOT EXISTS/i.test(sql) || /CREATE OR REPLACE/i.test(sql))
  }
  const risky = bootstrap.BOOTSTRAP_SQL.filter(needsGuard)
  if (risky.length === 0) pass('every statement re-runs without raising')
  else {
    for (const s of risky.slice(0, 5)) {
      fail(`raises on the second cold start: ${s.replace(/\s+/g, ' ').slice(0, 110)}…`)
    }
  }
}

console.log('\nThe tables the newest features query actually get created')
{
  /* A NAMED SPOT-CHECK ON TOP OF THE MECHANICAL ONE. The check above proves
     the arrays are wired; this proves the wiring reaches the thing somebody
     just built, and it is the line that would have gone red on the commit
     that shipped the insurance page. */
  const all = bootstrap.BOOTSTRAP_SQL.join('\n')
  const wanted = [
    'ClientInsuranceProgram',
    'DirectorySignal',
    'LeadMessage',
    'AdsFinding',
    'ClientOnboarding',
    'ClientMonthlyReport',
  ]
  for (const table of wanted) {
    if (new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`).test(all)) {
      pass(`${table} is created`)
    } else fail(`${table} is queried by this app and nothing here creates it`)
  }
}

console.log(
  failures === 0
    ? '\nAll schema-bootstrap checks passed.'
    : `\n${failures} schema-bootstrap check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
