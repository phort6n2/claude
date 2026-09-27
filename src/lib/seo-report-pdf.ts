/**
 * Read a supplier's monthly SEO report PDF into LINES of text, one array per
 * page — the only thing `seo-report.ts` needs, and the only part of this
 * feature that touches a PDF library.
 *
 * `unpdf`, not `pdfjs-dist`: it is PDF.js packaged for serverless runtimes,
 * with the worker inlined. Plain PDF.js reaches for a worker file at runtime,
 * which a bundled Vercel function does not carry — the same class of failure
 * `outputFileTracingIncludes` records for sharp, where the build is green and
 * the function dies on first use.
 *
 * Lines are rebuilt from the text items' vertical position, because a PDF has
 * no lines, only glyph runs placed on a page. Items within a couple of points
 * of each other vertically are one line, joined left to right.
 */
import { getDocumentProxy, getMeta, extractLinks } from 'unpdf'

export interface PdfReadout {
  /** Full-width lines: right for tables that run across the page. */
  pages: string[][]
  /**
   * The same page read as two COLUMNS, split at the middle. A two-column
   * section read across the page interleaves the columns line by line —
   * "Glass Doctor 25% review of windshield repair Portland, OR" is a
   * competitor's share of voice and an unrelated prompt fused into one line —
   * so anything laid out side by side is read from here instead.
   */
  columns: Array<{ left: string[]; right: string[] }>
  /** Document info fields (Title, Author, Creator, Producer…), as given. */
  info: Record<string, string>
  /** Every link annotation in the file. */
  links: string[]
}

export async function readPdf(bytes: Uint8Array): Promise<PdfReadout> {
  // unpdf/PDF.js detaches the buffer it is handed, so each call gets a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const pages: string[][] = []
  const columns: Array<{ left: string[]; right: string[] }> = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const width = page.getViewport({ scale: 1 }).width
    const content = await page.getTextContent()
    const items: Array<{ x: number; y: number; s: string }> = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      items.push({ x: item.transform[4], y: item.transform[5], s: item.str })
    }
    pages.push(toLines(items))
    columns.push({
      left: toLines(items.filter((it) => it.x < width / 2)),
      right: toLines(items.filter((it) => it.x >= width / 2)),
    })
  }

  let info: Record<string, string> = {}
  try {
    const meta = await getMeta(new Uint8Array(bytes))
    info = Object.fromEntries(
      Object.entries(meta.info || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    )
  } catch {
    /* Info is only screened, never shown; a file without it is fine. */
  }
  let links: string[] = []
  try {
    links = (await extractLinks(new Uint8Array(bytes))).links
  } catch {
    /* As above. */
  }
  return { pages, columns, info, links }
}

/** Items within a couple of points vertically are one line, left to right. */
function toLines(items: Array<{ x: number; y: number; s: string }>): string[] {
  const rows: Array<{ y: number; parts: Array<{ x: number; s: string }> }> = []
  for (const it of items) {
    let row = rows.find((r) => Math.abs(r.y - it.y) <= 2)
    if (!row) rows.push((row = { y: it.y, parts: [] }))
    row.parts.push({ x: it.x, s: it.s })
  }
  // PDF y grows UPWARD, so the top of the page is the largest y.
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) =>
    r.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.s)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
