'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'
import {
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  countSocialLinks,
  normalizeSocialUrl,
  readSocialLinks,
  socialLinkProblem,
  type SocialLinks,
  type SocialPlatform,
} from '@/lib/social-links'

/**
 * The shop's social profiles — for the Windshield Repair HQ listing, NOT for
 * their website.
 *
 * WHY A REVIEW SCREEN AT ALL. The importer finds these in the shop's own
 * footer, which is the right source and is still a guess: a footer's Facebook
 * link is as likely to be a "share this page" button as the shop's page, and
 * icon rows on template sites sometimes point at the web designer's accounts.
 * A wrong link here becomes a wrong fact about a business on a public
 * directory page — so `socialLinkProblem` refuses the shapes it can prove are
 * wrong, and this card is where somebody catches the ones it cannot: an
 * account that is real, is a profile, and belongs to somebody else. The
 * importer only ever FILLS A GAP (see persistClientFields), so a correction
 * made here survives every later re-import.
 *
 * Autosaves, like the other newer cards: optimistic first, then reconcile.
 * The screen runs locally before the PUT so a bad paste is answered
 * immediately rather than after a round trip — and the route screens again,
 * because this card is not the only writer.
 */
export default function SocialLinksCard({
  clientId,
  initial,
  /** Whether there is a website on file to read. Only changes the copy. */
  hasWebsite,
}: {
  clientId: string
  initial: unknown
  hasWebsite?: boolean
}) {
  const [links, setLinks] = useState<SocialLinks>(() => readSocialLinks(initial))
  // The text in the boxes, which is not the same thing as the stored links: a
  // half-typed URL is neither valid nor worth throwing away as the operator
  // types it.
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const start = readSocialLinks(initial)
    return Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, start[p] || '']))
  })
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Reading their website: found-but-not-stored links, offered rather than
  // written. See the note on review above — a share button can be proven
  // wrong, somebody else's real account cannot.
  const [scanning, setScanning] = useState(false)
  const [offer, setOffer] = useState<SocialLinks>({})
  const [scanNote, setScanNote] = useState<string | null>(null)

  async function scan() {
    setScanning(true)
    setScanNote(null)
    setOffer({})
    try {
      const res = await fetch(`/api/clients/${clientId}/social-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      const data = await res.json()
      setOffer(data.fresh || {})
      setScanNote(data.message || null)
    } catch (err) {
      setScanNote(err instanceof Error ? err.message : 'Could not read their website')
    } finally {
      setScanning(false)
    }
  }

  function accept(platforms: SocialPlatform[]) {
    const next = { ...links }
    for (const platform of platforms) {
      const found = offer[platform]
      if (!found) continue
      next[platform] = found
      setDrafts((d) => ({ ...d, [platform]: found }))
    }
    setOffer((o) => {
      const rest = { ...o }
      for (const platform of platforms) delete rest[platform]
      return rest
    })
    setLinks(next)
    void persist(next)
  }

  const offered = SOCIAL_PLATFORMS.filter((p) => !!offer[p])

  async function persist(next: SocialLinks) {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socialLinks: next }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      const count = countSocialLinks(next)
      setStatus(
        count
          ? `Saved — ${count} profile${count === 1 ? '' : 's'} on file for the directory listing.`
          : 'Saved — no profiles on file.'
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  function commit(platform: SocialPlatform, raw: string) {
    const text = raw.trim()
    if (!text) {
      setProblems((p) => ({ ...p, [platform]: '' }))
      if (!links[platform]) return
      const next = { ...links }
      delete next[platform]
      setLinks(next)
      void persist(next)
      return
    }
    const problem = socialLinkProblem(text)
    if (problem) {
      setProblems((p) => ({ ...p, [platform]: problem }))
      return
    }
    const normalized = normalizeSocialUrl(text)!
    setProblems((p) => ({ ...p, [platform]: '' }))
    setDrafts((d) => ({ ...d, [platform]: normalized }))
    if (normalized === links[platform]) return
    const next = { ...links, [platform]: normalized }
    setLinks(next)
    void persist(next)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="px-6 pt-5 pb-1">
        <h2 className="font-semibold text-gray-900">Social profiles</h2>
        <p className="text-sm text-gray-500">
          Sent to their Windshield Repair HQ listing. These do <strong>not</strong> appear on the
          site this platform hosts.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Read off the shop&rsquo;s own website, where these actually live — usually the footer.
          Google&rsquo;s API does not hand them over, so there is nothing to pull from the Business
          Profile.
        </p>
      </div>
      <div className="p-6 pt-4 space-y-3">
        {/* Its own button rather than a side effect of the full website
            import. That import rewrites the warranty, FAQ, story sections and
            photos from whatever it finds, so running it on a curated client to
            collect two URLs trades the curation for the URLs — and it refuses
            to start without a model key, which reading an <a href> does not
            need. */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scan}
              disabled={scanning || hasWebsite === false}
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {scanning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {scanning ? 'Reading their website…' : 'Find them on their website'}
            </button>
            <span className="text-xs text-gray-500">
              {hasWebsite === false
                ? 'No website on file — add one on the Website tab first.'
                : 'Reads one page. Changes nothing until you accept what it finds.'}
            </span>
          </div>
          {scanNote && <p className="mt-2 text-xs text-gray-700">{scanNote}</p>}
          {offered.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3">
              {offered.map((platform) => (
                <div key={platform} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 font-medium text-gray-700">
                    {SOCIAL_LABELS[platform]}
                  </span>
                  {/* Opens it, because the one thing the screen cannot check is
                      whether the account is theirs. */}
                  <a
                    href={offer[platform]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-blue-700 underline"
                  >
                    {offer[platform]}
                  </a>
                  <button
                    type="button"
                    onClick={() => accept([platform])}
                    className="shrink-0 rounded-md bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-700"
                  >
                    Use this
                  </button>
                </div>
              ))}
              {offered.length > 1 && (
                <button
                  type="button"
                  onClick={() => accept(offered)}
                  className="mt-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  Use all {offered.length}
                </button>
              )}
            </div>
          )}
        </div>
        {SOCIAL_PLATFORMS.map((platform) => (
          <div key={platform}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {SOCIAL_LABELS[platform]}
            </label>
            <input
              type="url"
              value={drafts[platform] || ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [platform]: e.target.value }))}
              onBlur={(e) => commit(platform, e.target.value)}
              placeholder={`https://${platform === 'x' ? 'x' : platform}.com/…`}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            {problems[platform] && (
              <p className="mt-1 text-xs text-amber-800">{problems[platform]} — not saved.</p>
            )}
          </div>
        ))}

        <div className="flex items-center gap-2 text-xs text-gray-500 min-h-[20px]">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status || (saving ? 'Saving…' : '')}
        </div>
      </div>
    </section>
  )
}
