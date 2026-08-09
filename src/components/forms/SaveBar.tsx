'use client'

import { Loader2, Check, AlertCircle, Save } from 'lucide-react'

export interface SaveState {
  saving: boolean
  message: { ok: boolean; text: string } | null
}

/**
 * Sticky save bar — appears only when there is something to save, and states
 * how many fields changed. One of these per routed tab; each tab saves
 * everything it shows, so there is never a second button holding data.
 */
export default function SaveBar({
  dirtyCount,
  saving,
  message,
  onSave,
  onDiscard,
}: {
  dirtyCount: number
  saving: boolean
  message: { ok: boolean; text: string } | null
  onSave: () => void
  onDiscard: () => void
}) {
  const show = dirtyCount > 0 || saving || !!message
  if (!show) return null

  return (
    <div className="sticky bottom-0 z-[60] mt-6 -mx-2">
      <div className="mx-2 mb-2 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur shadow-lg px-4 py-3 pr-4 sm:pr-52 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
              <span className="text-gray-600">Saving…</span>
            </>
          ) : message ? (
            <>
              {message.ok ? (
                <Check className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              )}
              <span className={message.ok ? 'text-green-700' : 'text-red-700'}>{message.text}</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-gray-700 font-medium">
                {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
              </span>
            </>
          )}
        </div>
        {dirtyCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save changes
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
