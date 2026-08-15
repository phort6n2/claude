'use client'

import { useCallback, useEffect, useState } from 'react'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

/**
 * The review queue for syndicated SEO articles.
 *
 * Three states matter and the page is organised around them: articles that
 * need a decision, articles that are live, and articles nobody can place.
 * Held first, because an article sitting in this queue is content the shop is
 * paying for and not getting.
 */

interface Article {
  id: string
  externalId: string
  title: string
  slug: string
  excerpt: string | null
  seedKeyword: string | null
  orgWebsite: string | null
  reviewFlags: string[]
  publishedAt: string | null
  authoredAt: string | null
  syncedAt: string
  clientId: string | null
  client: { businessName: string; slug: string; siteSubdomain: string | null } | null
}

interface ClientOption {
  id: string
  businessName: string
}

export default function SeoArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seo-articles')
      const data = await res.json()
      setArticles(data.articles || [])
      setClients(data.clients || [])
    } catch {
      setStatus('Could not load articles.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function sync() {
    setSyncing(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/seo-articles/sync', { method: 'POST' })
      const data = await res.json()
      setStatus(data.message || (data.success ? 'Synced.' : 'Sync failed.'))
      await load()
    } catch {
      setStatus('Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/seo-articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) setStatus(data.error || 'Could not save.')
      await load()
    } catch {
      setStatus('Could not save.')
    } finally {
      setBusyId(null)
    }
  }

  const held = articles.filter((a) => !a.publishedAt && a.clientId)
  const unmatched = articles.filter((a) => !a.clientId)
  const live = articles.filter((a) => a.publishedAt)

  function Row({ article }: { article: Article }) {
    const busy = busyId === article.id
    const host = article.client
      ? `${article.client.siteSubdomain || article.client.slug}.glassleads.app`
      : null
    return (
      <div className="py-4 border-b border-gray-100 last:border-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{article.title}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {article.seedKeyword && <>“{article.seedKeyword}” · </>}
              {article.orgWebsite || 'no website on the article'}
              {article.authoredAt && (
                <> · written {new Date(article.authoredAt).toLocaleDateString()}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {article.publishedAt && host && (
              <a
                href={`https://${host}/blog/${article.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <select
              value={article.clientId || ''}
              disabled={busy}
              onChange={(e) => patch(article.id, { clientId: e.target.value || null })}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 max-w-[200px]"
            >
              <option value="">— no shop —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant={article.publishedAt ? 'outline' : 'primary'}
              disabled={busy || !article.clientId}
              onClick={() => patch(article.id, { published: !article.publishedAt })}
            >
              {busy ? (
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
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="SEO Articles" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Articles from BabyLoveGrowth</CardTitle>
              <p className="mt-1 text-sm text-gray-600 max-w-prose">
                Synced nightly and matched to a shop by the website the article was written for.
                Clean articles go live on that shop&apos;s site at <code>/blog</code>; anything
                making a claim this platform can&apos;t make on a shop&apos;s behalf waits here.
              </p>
            </div>
            <Button onClick={sync} disabled={syncing} className="shrink-0">
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Sync now</span>
            </Button>
          </CardHeader>
          {status && (
            <CardContent className="pt-0">
              <p className="text-sm text-gray-700">{status}</p>
            </CardContent>
          )}
        </Card>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : articles.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-gray-600">
              Nothing synced yet. Save the BabyLoveGrowth key in Settings → API keys, then press
              Sync now.
            </CardContent>
          </Card>
        ) : (
          <>
            {held.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Waiting for review ({held.length})</CardTitle>
                  <p className="mt-1 text-sm text-gray-600">
                    Read each one before publishing. The scan catches known phrasings, not every
                    invented fact — a plainly-stated “serving Denver since 1994” will not be
                    flagged.
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  {held.map((a) => (
                    <Row key={a.id} article={a} />
                  ))}
                </CardContent>
              </Card>
            )}

            {unmatched.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>No shop matched ({unmatched.length})</CardTitle>
                  <p className="mt-1 text-sm text-gray-600">
                    The website on the article didn&apos;t match any client&apos;s domain, Business
                    Profile website or glassleads.app subdomain. Pick the shop, or fix the
                    organisation&apos;s website in BabyLoveGrowth so the next sync matches on its
                    own.
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  {unmatched.map((a) => (
                    <Row key={a.id} article={a} />
                  ))}
                </CardContent>
              </Card>
            )}

            {live.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Live ({live.length})</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {live.map((a) => (
                    <Row key={a.id} article={a} />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
