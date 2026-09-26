/**
 * Read a draft out of whatever the model actually sent back.
 *
 * Its own module because BOTH drafters need it — story sections and the FAQ
 * are the same problem, a JSON array of objects, and that problem turned out
 * not to be a small one.
 */

export type DraftParse =
  | { ok: true; sections: Array<Record<string, unknown>>; truncated: boolean }
  | { ok: false; kind: 'truncated' | 'no-json' | 'unparseable'; detail: string }

/**
 * Read the sections out of whatever the model actually sent back.
 *
 * `text.match(/\[[\s\S]*\]/)` was the whole parser, and it failed in
 * production on the first real press with "Could not read the draft that came
 * back" — a sentence that names nothing, over a response nothing logged. Three
 * separate things are wrong with that one line, and each is a different
 * failure the operator cannot tell apart:
 *
 * - A TRUNCATED RESPONSE has no closing bracket, so the match fails and two
 *   perfectly good finished sections are thrown away with the third. Salvage
 *   the objects that closed; a short draft beats no draft, and the operator
 *   can press again for more.
 * - A LEADING BRACKET IN PROSE — "Here are the sections [built only from the
 *   facts above]:" — makes the greedy match start in the wrong place and drag
 *   the prose into the JSON. So the array is found by SCANNING for a `[` that
 *   is actually followed by an object, honouring string literals and escapes,
 *   rather than by the first and last bracket in the document.
 * - AN OBJECT WRAPPER (`{"sections": [...]}`) and a fenced block are both
 *   ordinary things for a model to return, and neither is a failure.
 *
 * What survives as a failure is worth distinguishing, because the fixes are
 * opposite: `truncated` means ask for less or allow more, `no-json` means the
 * model answered in prose (a refusal or a question), `unparseable` means it
 * tried and the JSON is malformed. The route says which and logs the text.
 */
/**
 * Walk from `start` to the bracket that closes it, ignoring anything inside
 * a string. Returns the index of the closer, or -1 if the text runs out —
 * which is exactly what a truncated response looks like.
 */
function closerFor(s: string, start: number): number {
  const open = s[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export function parseDraftArray(text: string): DraftParse {
  // Fences are not JSON but they are not a problem either.
  const body = text.replace(/```(?:json)?/gi, '').trim()
  if (!body) return { ok: false, kind: 'no-json', detail: 'the response was empty' }

  /** The first `[` whose contents are objects, not a bracketed aside in prose. */
  let arrayStart = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '[') continue
    const next = body.slice(i + 1).match(/^\s*(.)/)
    if (next && next[1] === '{') {
      arrayStart = i
      break
    }
  }

  if (arrayStart >= 0) {
    const end = closerFor(body, arrayStart)
    if (end > arrayStart) {
      try {
        const parsed = JSON.parse(body.slice(arrayStart, end + 1)) as unknown
        if (Array.isArray(parsed)) {
          return { ok: true, sections: parsed as Array<Record<string, unknown>>, truncated: false }
        }
      } catch (error) {
        return {
          ok: false,
          kind: 'unparseable',
          detail: error instanceof Error ? error.message : 'JSON.parse failed',
        }
      }
    }
    // No closer: the response stopped mid-array. Keep the objects that finished.
    const salvaged: Array<Record<string, unknown>> = []
    for (let i = arrayStart + 1; i < body.length; i++) {
      if (body[i] !== '{') continue
      const end2 = closerFor(body, i)
      if (end2 < 0) break
      try {
        salvaged.push(JSON.parse(body.slice(i, end2 + 1)) as Record<string, unknown>)
      } catch {
        // One malformed object does not cost the ones before it.
      }
      i = end2
    }
    if (salvaged.length) return { ok: true, sections: salvaged, truncated: true }
    return { ok: false, kind: 'truncated', detail: 'the draft was cut off before the first section' }
  }

  // An object: either one section, or a wrapper around the array.
  const objectStart = body.indexOf('{')
  if (objectStart >= 0) {
    const end = closerFor(body, objectStart)
    if (end > objectStart) {
      try {
        const parsed = JSON.parse(body.slice(objectStart, end + 1)) as Record<string, unknown>
        const wrapped = Object.values(parsed).find((v) => Array.isArray(v))
        if (Array.isArray(wrapped)) {
          return { ok: true, sections: wrapped as Array<Record<string, unknown>>, truncated: false }
        }
        if (typeof parsed.heading === 'string' || typeof parsed.body === 'string') {
          return { ok: true, sections: [parsed], truncated: false }
        }
      } catch (error) {
        return {
          ok: false,
          kind: 'unparseable',
          detail: error instanceof Error ? error.message : 'JSON.parse failed',
        }
      }
    }
  }

  return {
    ok: false,
    kind: 'no-json',
    // The first words are the useful part: a refusal and a question both start
    // by saying so, and that is what the operator needs to read.
    detail: `no JSON in the response, which began: ${body.slice(0, 160)}`,
  }
}


export type NameListParse =
  | { ok: true; names: string[]; truncated: boolean }
  | { ok: false; kind: 'truncated' | 'no-json' | 'unparseable'; detail: string }

/**
 * A JSON array of STRINGS out of a model's reply — the nearby-towns list.
 *
 * Same lessons as parseDraftArray, for the same reason: that suggester used
 * the greedy `/\[[\s\S]*\]/` too, and it answered "Could not read the list
 * that came back" in production with nothing logged. The array is found by
 * scanning for a `[` that actually opens a list of strings (so "the towns
 * [closest first]:" in prose is skipped), a wrapper object is fine, and a
 * reply cut off mid-list keeps every name that finished.
 */
export function parseNameList(text: string): NameListParse {
  const body = text.replace(/```(?:json)?/gi, '').trim()
  if (!body) return { ok: false, kind: 'no-json', detail: 'the response was empty' }

  let start = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '[') continue
    const next = body.slice(i + 1).match(/^\s*(.)/)
    if (next && next[1] === '"') {
      start = i
      break
    }
  }
  if (start < 0) {
    return { ok: false, kind: 'no-json', detail: `no list of names in: ${body.slice(0, 160)}` }
  }

  const clean = (list: unknown[]) =>
    list.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean)

  const end = closerFor(body, start)
  if (end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1)) as unknown
      if (Array.isArray(parsed)) return { ok: true, names: clean(parsed), truncated: false }
    } catch (error) {
      return { ok: false, kind: 'unparseable', detail: error instanceof Error ? error.message : 'JSON.parse failed' }
    }
  }
  // Cut off mid-list: keep every name whose closing quote arrived.
  const names: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  const tail = body.slice(start)
  while ((m = re.exec(tail))) {
    try {
      names.push(JSON.parse(`"${m[1]}"`) as string)
    } catch {
      // A malformed name does not cost the ones before it.
    }
  }
  const kept = clean(names)
  if (kept.length) return { ok: true, names: kept, truncated: true }
  return { ok: false, kind: 'truncated', detail: 'the list was cut off before the first name' }
}
