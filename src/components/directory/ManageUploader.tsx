'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle2, ImageIcon } from 'lucide-react'

interface ShopOption {
  slug: string
  name: string
  city: string
  state: string
}

type Status = 'idle' | 'uploading' | 'done' | 'error'

export function ManageUploader({ shops }: { shops: ShopOption[] }) {
  const [secret, setSecret] = useState('')
  const [slug, setSlug] = useState(shops[0]?.slug ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [uploaded, setUploaded] = useState<string[]>([])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !slug) return
    setStatus('uploading')
    setMessage('')
    try {
      const body = new FormData()
      body.set('slug', slug)
      body.set('file', file)
      const res = await fetch('/api/directory/photos', {
        method: 'POST',
        headers: { 'x-upload-secret': secret },
        body,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setUploaded((u) => [json.url, ...u])
      setStatus('done')
      setMessage('Uploaded. It will appear on the listing within a few minutes.')
      setFile(null)
      ;(e.target as HTMLFormElement).reset()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const field =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="secret">
          Upload secret
        </label>
        <input
          id="secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="DIRECTORY_UPLOAD_SECRET"
          className={field}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="shop">
          Shop
        </label>
        <select id="shop" value={slug} onChange={(e) => setSlug(e.target.value)} className={field}>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name} — {s.city}, {s.state.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="file">
          Photo (JPG, PNG, or WebP · max 5 MB)
        </label>
        <input
          id="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {message && (
        <p
          className={
            status === 'error'
              ? 'flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
              : 'flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700'
          }
        >
          {status !== 'error' && <CheckCircle2 width={16} height={16} />}
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'uploading' || !file || !secret}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'uploading' ? (
          <Loader2 className="animate-spin" width={16} height={16} />
        ) : (
          <Upload width={16} height={16} />
        )}
        Upload photo
      </button>

      {uploaded.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <ImageIcon width={15} height={15} /> Uploaded this session
          </p>
          <div className="flex flex-wrap gap-2">
            {uploaded.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="Uploaded" className="h-16 w-24 rounded-md border border-gray-200 object-cover" />
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
