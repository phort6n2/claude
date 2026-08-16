import { SiteBaseStyles, telHrefFor, type SiteClient } from '@/components/sites/shared'
import { sitePaletteVars } from '@/lib/site-theme'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { stripVendorLinks } from '@/lib/article-whitelabel'

/**
 * The shop's article pages.
 *
 * These exist to be found in search, so they carry the shop's brand and,
 * more importantly, a way to act: an article that ranks and then leaves the
 * reader with nowhere to go is traffic the shop pays for and does not keep.
 * Every page ends on the phone number and the quote form, and the header
 * carries the number the whole way down the page on mobile, because a reader
 * with a cracked windscreen is holding a phone.
 */

export interface BlogClient extends SiteClient {
  siteSubdomain?: string | null
}

function Shell({
  client,
  basePath,
  children,
}: {
  client: BlogClient
  basePath: string
  children: React.ReactNode
}) {
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const year = new Date().getFullYear()
  return (
    <div
      className="gl-site min-h-screen bg-[var(--paper)] text-[var(--tx)] leading-[1.62]"
      style={palette as React.CSSProperties}
    >
      <SiteBaseStyles />
      <header className="border-b border-[var(--line)] sticky top-0 z-10 bg-[var(--paper)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 min-h-[64px] flex items-center justify-between gap-4">
          <a href={basePath || '/'} className="font-bold no-underline text-[var(--brand)]">
            {client.businessName}
          </a>
          <a
            href={telHrefFor(client.phone)}
            className="font-bold no-underline text-[var(--brand)]"
          >
            {client.phone}
          </a>
        </div>
      </header>
      <main id="main" className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {children}
      </main>
      <footer className="border-t border-[var(--line)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 text-sm text-[var(--tx-muted)] space-y-1">
          <div>
            <span className="font-bold text-[var(--tx)]">{client.businessName}</span>
            {client.hasShopLocation && (
              <>
                {' '}
                · {client.streetAddress}, {client.city}, {client.state} {client.postalCode}
              </>
            )}{' '}
            · {client.phone}
          </div>
          <div>
            © {year} {client.businessName}.{' '}
            <a href={basePath || '/'} className="text-[var(--brand)]">
              Home
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** The closing ask. Identical on every article on purpose. */
function CallToAction({ client, basePath }: { client: BlogClient; basePath: string }) {
  return (
    <aside className="mt-12 rounded-2xl border border-[var(--line)] bg-[var(--paper-2,transparent)] p-6">
      <h2 className="text-xl font-extrabold tracking-tight m-0">
        Got a chip or a crack right now?
      </h2>
      <p className="mt-2 text-[15px] text-[var(--tx2)]">
        Tell us the vehicle and where the damage is and {client.businessName} will come back with
        a price.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={telHrefFor(client.phone)}
          className="inline-flex items-center rounded-xl px-5 py-3 font-bold no-underline text-white bg-[var(--brand)]"
        >
          Call {client.phone}
        </a>
        <a
          href={`${basePath || ''}/#quote`}
          className="inline-flex items-center rounded-xl px-5 py-3 font-bold no-underline text-[var(--brand)] border border-[var(--line)]"
        >
          Get a quote
        </a>
      </div>
    </aside>
  )
}

export interface ArticleCard {
  slug: string
  title: string
  excerpt: string
  heroImageUrl: string | null
  publishedAt: Date | null
}

export function BlogIndex({
  client,
  basePath,
  articles,
}: {
  client: BlogClient
  basePath: string
  articles: ArticleCard[]
}) {
  return (
    <Shell client={client} basePath={basePath}>
      <h1 className="text-[clamp(1.875rem,1.5rem+1.5vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-.02em] m-0">
        Auto glass advice from {client.businessName}
      </h1>
      <p className="mt-3 text-[15px] text-[var(--tx2)] max-w-prose">
        What to do about chips, cracks, calibration and insurance — written for drivers in{' '}
        {client.city}.
      </p>

      <div className="mt-10 space-y-8">
        {articles.map((article) => (
          <article key={article.slug} className="flex gap-4 sm:gap-6">
            {article.heroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.heroImageUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="hidden sm:block h-28 w-40 shrink-0 rounded-xl object-cover border border-[var(--line)]"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight m-0">
                <a
                  href={`${basePath}/blog/${article.slug}`}
                  className="no-underline text-[var(--tx)] hover:text-[var(--brand)]"
                >
                  {article.title}
                </a>
              </h2>
              {article.publishedAt && (
                <p className="mt-1 text-xs text-[var(--tx-muted)]">
                  {article.publishedAt.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              )}
              <p className="mt-2 text-[15px] text-[var(--tx2)]">{article.excerpt}</p>
            </div>
          </article>
        ))}
      </div>

      <CallToAction client={client} basePath={basePath} />
    </Shell>
  )
}

export function BlogArticle({
  client,
  basePath,
  article,
}: {
  client: BlogClient
  basePath: string
  article: {
    title: string
    contentHtml: string | null
    contentMarkdown: string | null
    heroImageUrl: string | null
    publishedAt: Date | null
  }
}) {
  // Never rendered raw. See lib/sanitize-html.ts — this HTML is written by a
  // third party and served from the shop's own origin. Vendor links go first:
  // the sanitiser asks whether markup can execute, not whose name is on it.
  const html = sanitizeHtml(stripVendorLinks(article.contentHtml))

  return (
    <Shell client={client} basePath={basePath}>
      <a href={`${basePath}/blog`} className="text-sm font-bold no-underline text-[var(--brand)]">
        ← All articles
      </a>
      <h1 className="mt-4 text-[clamp(1.875rem,1.5rem+1.5vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-.02em] m-0">
        {article.title}
      </h1>
      {article.publishedAt && (
        <p className="mt-2 text-sm text-[var(--tx-muted)]">
          {article.publishedAt.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}
      {article.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.heroImageUrl}
          alt=""
          aria-hidden="true"
          className="mt-6 w-full rounded-2xl border border-[var(--line)] object-cover"
        />
      )}

      {html ? (
        <div
          className="mt-8 text-[16px] text-[var(--tx2)] [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-[var(--tx)] [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[var(--tx)] [&_h3]:mt-8 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:mb-4 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:mb-4 [&_li]:mb-1.5 [&_a]:text-[var(--brand)] [&_a]:underline [&_img]:rounded-xl [&_img]:my-6 [&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:font-bold [&_th]:border-b [&_th]:border-[var(--line)] [&_td]:border-b [&_td]:border-[var(--line)] [&_td]:py-2 [&_th]:py-2 [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-4 [&_blockquote]:italic"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="mt-8 text-[15px] text-[var(--tx2)] whitespace-pre-wrap">
          {article.contentMarkdown || ''}
        </p>
      )}

      <CallToAction client={client} basePath={basePath} />
    </Shell>
  )
}
