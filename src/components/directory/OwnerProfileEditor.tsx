'use client'

import { useState } from 'react'
import { Pencil, Loader2, Check, Sparkles, Lock } from 'lucide-react'

const PLATFORMS: { key: string; label: string; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourshop' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourshop' },
  { key: 'yelp', label: 'Yelp', placeholder: 'https://yelp.com/biz/yourshop' },
  { key: 'x', label: 'X / Twitter', placeholder: 'https://x.com/yourshop' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourshop' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourshop' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yourshop' },
]

interface Props {
  initial: {
    description: string
    phone: string
    website: string
    email: string
    blogUrl: string
    socials: { platform: string; url: string }[]
  }
  /** Blog feed is a paid perk — free shops see a locked upgrade prompt. */
  featured?: boolean
  featuredHref?: string
  featuredPrice?: string
}

export function OwnerProfileEditor({
  initial,
  featured = false,
  featuredHref,
  featuredPrice = '$7/mo',
}: Props) {
  const [description, setDescription] = useState(initial.description)
  const [phone, setPhone] = useState(initial.phone)
  const [website, setWebsite] = useState(initial.website)
  const [email, setEmail] = useState(initial.email)
  const [blogUrl, setBlogUrl] = useState(initial.blogUrl)
  const [socials, setSocials] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLATFORMS.map((p) => [p.key, initial.socials.find((s) => s.platform === p.key)?.url ?? '']))
  )
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError('')
    const payload = {
      description,
      phone,
      website,
      email,
      blogUrl,
      socials: PLATFORMS.map((p) => ({ platform: p.key, url: socials[p.key]?.trim() ?? '' })).filter(
        (s) => s.url
      ),
    }
    try {
      const res = await fetch('/api/directory/owner/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const input =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
  const label = 'mb-1.5 block text-sm font-medium text-gray-700'

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Pencil width={18} height={18} className="text-blue-600" /> Edit your listing
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Update your details and social profiles — changes appear on your public listing within a
        few minutes.
      </p>

      <form onSubmit={save} className="mt-5 space-y-4">
        <div>
          <label className={label} htmlFor="p-desc">
            Description
          </label>
          <textarea
            id="p-desc"
            rows={4}
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="p-phone">
              Phone
            </label>
            <input id="p-phone" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="p-email">
              Email
            </label>
            <input id="p-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="p-web">
              Website
            </label>
            <input id="p-web" type="url" className={input} value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="p-blog">
              Blog or RSS feed URL{' '}
              {featured ? (
                <span className="font-normal text-gray-400">(optional)</span>
              ) : (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  <Sparkles width={11} height={11} /> Featured
                </span>
              )}
            </label>
            <input
              id="p-blog"
              type="url"
              placeholder="https://yourshop.com/blog"
              className={`${input} ${featured ? '' : 'cursor-not-allowed bg-gray-50 text-gray-400'}`}
              value={blogUrl}
              disabled={!featured}
              onChange={(e) => setBlogUrl(e.target.value)}
            />
            {featured ? (
              <p className="mt-1 text-xs text-gray-400">
                Have a blog? We&apos;ll show your latest posts on your listing. Paste your blog page
                or RSS feed — we&apos;ll find the feed automatically.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                <Lock width={11} height={11} className="mr-1 inline align-[-1px] text-gray-400" />
                Featured shops can show their latest blog posts right on their listing — fresh
                content that keeps customers reading.{' '}
                {featuredHref && (
                  <a href={featuredHref} className="font-semibold text-blue-600 hover:text-blue-700">
                    Upgrade for {featuredPrice} →
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className={label}>Social profiles</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map((p) => (
              <div key={p.key}>
                <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor={`s-${p.key}`}>
                  {p.label}
                </label>
                <input
                  id={`s-${p.key}`}
                  type="url"
                  placeholder={p.placeholder}
                  className={input}
                  value={socials[p.key] ?? ''}
                  onChange={(e) => setSocials((prev) => ({ ...prev, [p.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {status === 'saving' ? (
              <Loader2 className="animate-spin" width={16} height={16} />
            ) : status === 'saved' ? (
              <Check width={16} height={16} />
            ) : null}
            {status === 'saved' ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  )
}
