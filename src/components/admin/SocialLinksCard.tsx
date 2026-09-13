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
}: {
  clientId: string
  initial: unknown
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
          Filled in by &ldquo;Import from their website&rdquo; on the Website tab — a shop&rsquo;s
          own footer is where these live. Google&rsquo;s API does not hand them over, so there is
          nothing to pull from the Business Profile.
        </p>
      </div>
      <div className="p-6 pt-4 space-y-3">
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
