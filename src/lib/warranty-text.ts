/**
 * The warranty terms as a customer should read them: plain sentences.
 *
 * The text is typed by an operator, imported from the shop's old site, or
 * written by "Expand warranty" — and that last one came back as markdown on
 * EliteProGlass: "# 1-Year Workmanship Warranty" as its first line, which the
 * card printed literally, hash and all, directly under an H2 saying the same
 * words. The page renders plain text (whitespace-pre-line), so markdown is
 * never formatting here, only stray symbols.
 *
 * Applied at RENDER as well as when the expander answers, because the text
 * already saved on a live site is what the visitor is looking at today.
 * Wording is never changed — only markup is removed, and a first line that
 * merely repeats the title the band already shows.
 */
export function warrantyBody(text: string, title?: string | null): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '') // headings
        .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2') // bold
        .replace(/^\s*[*+]\s+/, '• ') // bullet markers, kept as bullets
        .replace(/^\s*-\s+/, '• ')
    )
  // Drop leading blank lines, then a first line that only repeats the title.
  while (lines.length && !lines[0].trim()) lines.shift()
  const heading = title ? norm(title) : ''
  if (lines.length > 1 && heading && norm(lines[0]) === heading) {
    lines.shift()
    while (lines.length && !lines[0].trim()) lines.shift()
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * The opening sentence of the terms, set apart as the card's lead, and the
 * rest. Typography only: every word is theirs and in their order — the
 * emphasis is on the sentence they chose to put first. Returns no lead when
 * there is nothing to split (one sentence, a list, or an opener too long to
 * read as a lead), so the text simply renders whole.
 */
export function warrantyLead(body: string): { lead: string | null; rest: string } {
  const m = body.match(/^([^\n•]{12,160}?[.!?])[ \t]+(\S[\s\S]*)$/)
  if (!m) return { lead: null, rest: body }
  return { lead: m[1], rest: m[2] }
}
