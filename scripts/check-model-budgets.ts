/**
 * Every model call leaves room to THINK, and a reply is read the robust way.
 *
 * Run: npx tsx scripts/check-model-budgets.ts
 *
 * The model these features call thinks by default, and the thinking is paid
 * out of `max_tokens`. "Suggest nearby cities" asked for 800 — sized for a
 * list of fourteen names, with nothing left for deciding which towns they
 * were — so every press in production stopped before the list was written
 * and answered 400 with nothing logged. The warranty expander (600) and the
 * city-page writer (1200, which the bulk "write every city" button runs)
 * carried the same budget. Nothing about a small budget looks wrong in a
 * diff; it only fails on the day the model thinks a little longer.
 *
 * So this reads the SOURCE: every `messages.create` naming a thinking model
 * must allow at least MIN_BUDGET. A new call written tomorrow is covered
 * without anybody remembering this file exists.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { parseNameList } from '../src/lib/draft-json'

/** Thinking by default: every model this codebase uses that does. */
const THINKING_MODEL = /model:\s*'claude-(opus-5|fable-5)[^']*'/
/** Enough for a considered answer plus the answer. The drafters settled on 6000. */
const MIN_BUDGET = 4000

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* sourceFiles(path)
    else if (/\.(ts|tsx)$/.test(name)) yield path
  }
}

console.log('\nEVERY THINKING-MODEL CALL HAS ROOM TO THINK')
{
  let calls = 0
  for (const file of sourceFiles(join(__dirname, '..', 'src'))) {
    const text = readFileSync(file, 'utf8')
    const re = new RegExp(THINKING_MODEL.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      calls++
      // The budget sits in the same call, within a few lines of the model.
      const window = text.slice(m.index, m.index + 800)
      const budget = window.match(/max_tokens:\s*([\d_]+)/)
      const line = text.slice(0, m.index).split('\n').length
      const where = `${file.replace(/.*\/src\//, 'src/')}:${line}`
      if (!budget) fail(`${where}: no max_tokens beside the model — cannot tell what it allows`)
      else if (Number(budget[1].replace(/_/g, '')) < MIN_BUDGET) {
        fail(`${where}: max_tokens ${budget[1]} — the default thinking can use all of it and leave no answer`)
      } else pass(`${where}: max_tokens ${budget[1]}`)
    }
  }
  if (calls === 0) fail('found no thinking-model calls at all — the pattern no longer matches the code')
}

console.log('\nA LIST OF NAMES IS READ THE WAY A REAL REPLY ARRIVES')
{
  const cases: Array<[string, string, string[] | null]> = [
    ['a bare array', '["Aloha", "Beaverton"]', ['Aloha', 'Beaverton']],
    ['a bracketed aside in the prose before it', 'Closest first [by road]:\n["Aloha","Cornelius"]', ['Aloha', 'Cornelius']],
    ['a fenced block', '```json\n["Aloha"]\n```', ['Aloha']],
    ['a wrapper object', '{"towns": ["A", "B"]}', ['A', 'B']],
    ['cut off mid-list keeps the names that finished', '["Aloha", "Beaverton", "Tigar', ['Aloha', 'Beaverton']],
    ['a name with a quote in it', '["Coeur d\'Alene", "St. Mary\\"s"]', ["Coeur d'Alene", 'St. Mary"s']],
    ['prose with no list is a failure, not an empty list', 'I would need to know the state.', null],
    ['cut off before the first name is a failure', '["Alo', null],
  ]
  for (const [label, text, want] of cases) {
    const got = parseNameList(text)
    if (want === null) {
      if (!got.ok) pass(`${label} → ${got.kind}`)
      else fail(`${label}: read ${JSON.stringify(got.names)} out of nothing`)
    } else if (got.ok && JSON.stringify(got.names) === JSON.stringify(want)) pass(label)
    else fail(`${label}: got ${JSON.stringify(got)}`)
  }
}

console.log(failures === 0 ? '\nAll model-budget checks passed.' : `\n${failures} model-budget check${failures === 1 ? '' : 's'} FAILED.`)
process.exit(failures === 0 ? 0 : 1)
