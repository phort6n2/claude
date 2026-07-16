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
      className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl bg-white p-2 shadow-lg sm:flex-row"
    >
      <div className="flex flex-1 items-center gap-2 rounded-lg px-3">
        <Search width={18} height={18} className="text-gray-400" />
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
        className="rounded-lg border-none bg-gray-50 px-3 py-2.5 text-gray-700 outline-none sm:w-40"
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
        className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700"
      >
        Search
      </button>
    </form>
  )
}
