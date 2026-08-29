'use client'

import { useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { describeSnippet } from '@/lib/site-scripts'
import { errorFrom } from '@/lib/http-error'

/**
 * Tags the owner pastes onto a client's site.
 *
 * ADMIN ONLY, and it needs saying: this is arbitrary JavaScript on a live
 * business's public pages, and a bad paste breaks the page that takes their
 * paid traffic. There is no portal equivalent and there should never be one.
 *
 * The card reports what it PARSED rather than echoing the text back, because
 * the failure mode here is silent — a snippet that looks installed in the
 * page source and never executes. Seeing "will load: 1 external script
 * (connect.facebook.net)" is the only cheap way to know the paste worked
 * before waiting on a vendor dashboard to light up.
 */
export default function SiteScriptsCard({
  clientId,
  headScripts,
  bodyEndScripts,
}: {
  clientId: string
  headScripts: string | null
  bodyEndScripts: string | null
}) {
  const [head, setHead] = useState(headScripts || '')
  const [body, setBody] = useState(bodyEndScripts || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headScripts: head.trim() || null, bodyEndScripts: body.trim() || null }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      setMessage({ ok: true, text: 'Saved. The site picks it up within about 5 minutes.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 pt-4 space-y-4">
      <Slot
        label="Head"
        hint="Runs before the page renders. Site verification, a consent manager — anything that has to be there first."
        value={head}
        onChange={setHead}
      />
      <Slot
        label="End of body"
        hint="Runs after the page is interactive. Chat widgets, pixels, heatmaps. Put a tag here unless it has a reason to be in the head — these are paid landing pages, and a blocking script is spend that bought a slower page."
        value={body}
        onChange={setBody}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save scripts
        </button>
        {message && (
          <span className={`text-sm flex items-center gap-1.5 ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {message.text}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Paste the whole tag, script tags and all — it gets taken apart and re-emitted so it
        actually runs. Markup dropped into a page as HTML never executes its scripts, which is how
        a tag ends up looking installed and doing nothing.
      </p>
    </div>
  )
}

function Slot({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{label}</label>
      <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder="<script src=&quot;https://…&quot;></script>"
        className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-xs text-gray-500 mt-1">{describeSnippet(value)}</p>
    </div>
  )
}
