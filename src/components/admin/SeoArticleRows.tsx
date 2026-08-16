'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'

/**
 * This shop's articles, with the one decision the admin has to make: is this
 * allowed on their site.
 *
 * No client selector here — the tab is already one shop, and a dropdown that
 * could move an article to a different business is not something to leave
 * lying around on a page about this one.
 */

export interface ArticleRow {
  id: string
  title: string
  slug: string
  seedKeyword: string | null
  reviewFlags: string[]
  publishedAt: string | null
  authoredAt: string | null
}

export default function SeoArticleRows({
  articles,
  host,
}: {
  articles: ArticleRow[]
  host: string
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(article: ArticleRow) {
    setBusyId(article.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/seo-articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !article.publishedAt }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not save.')
      } else {
        router.refresh()
      }
    } catch {
      setError('Could not save.')
    } finally {
      setBusyId(null)
    }
  }

  if (articles.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        Nothing pulled for this shop yet. Save their key above, switch SEO content on, then press
        Sync articles now.
      </p>
    )
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {articles.map((article) => (
          <li key={article.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900">{article.title}</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {article.seedKeyword && <>“{article.seedKeyword}” · </>}
                  {article.publishedAt ? (
                    <>Live since {new Date(article.publishedAt).toLocaleDateString()}</>
                  ) : (
                    <>Not on the site</>
                  )}
                  {article.authoredAt && (
                    <> · written {new Date(article.authoredAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {article.publishedAt && (
                  <a
                    href={`https://${host}/blog/${article.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant={article.publishedAt ? 'outline' : 'primary'}
                  disabled={busyId === article.id}
                  onClick={() => toggle(article)}
                >
                  {busyId === article.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : article.publishedAt ? (
                    'Take down'
                  ) : (
                    'Publish'
                  )}
                </Button>
              </div>
            </div>

            {article.reviewFlags.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {article.reviewFlags.map((flag, i) => (
                  <li
                    key={i}
                    className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="min-w-0">{flag}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
