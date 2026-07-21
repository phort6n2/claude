'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import type { StateSummary } from '@/lib/directory/types'

export function HeroSearch({ states }: { states: StateSummary[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [state, setState] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (state) params.set('state', state)
    router.push(`/directory/search?${params.toString()}`)
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-blue-950/40 ring-1 ring-black/5 sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 items-center gap-2 rounded-xl px-3 focus-within:bg-gray-50 sm:focus-within:bg-transparent">
        <Search width={18} height={18} className="shrink-0 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="City, ZIP, or shop name"
          className="w-full bg-transparent py-2.5 text-gray-900 outline-none placeholder:text-gray-400"
          aria-label="Search auto glass shops"
        />
      </div>
      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        className="cursor-pointer rounded-xl border-none bg-gray-50 px-3 py-2.5 text-gray-700 outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 sm:w-40"
        aria-label="Filter by state"
      >
        <option value="">All states</option>
        {states.map((s) => (
          <option key={s.state} value={s.state}>
            {s.stateFull}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-6 py-2.5 font-semibold text-white shadow-lg shadow-blue-600/30 outline-none transition-colors hover:from-blue-500 hover:to-blue-600 active:from-blue-700 active:to-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <Search width={18} height={18} className="sm:hidden" />
        Search
      </button>
    </form>
  )
}
