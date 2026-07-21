'use client'

import { useState } from 'react'
import { Pencil, Loader2, Check } from 'lucide-react'

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
    socials: { platform: string; url: string }[]
  }
}

export function OwnerProfileEditor({ initial }: Props) {
  const [description, setDescription] = useState(initial.description)
  const [phone, setPhone] = useState(initial.phone)
  const [website, setWebsite] = useState(initial.website)
  const [email, setEmail] = useState(initial.email)
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
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
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
