'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import type { StateSummary, ServiceMeta, ServiceKey } from '@/lib/directory/types'

interface SearchFiltersProps {
  states: StateSummary[]
  services: ServiceMeta[]
  initial: {
    q?: string
    state?: string
    service?: string
    mobileOnly?: boolean
  }
}

const selectClass =
  'w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

export function SearchFilters({ states, services, initial }: SearchFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const [q, setQ] = useState(initial.q ?? '')
  const [state, setState] = useState(initial.state ?? '')
  const [service, setService] = useState(initial.service ?? '')
  const [mobileOnly, setMobileOnly] = useState(!!initial.mobileOnly)

  function apply(overrides?: Partial<{ state: string; service: string; mobileOnly: boolean }>) {
    const next = { state, service, mobileOnly, ...overrides }
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (next.state) params.set('state', next.state)
    if (next.service) params.set('service', next.service as ServiceKey)
    if (next.mobileOnly) params.set('mobile', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
      className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <SlidersHorizontal width={16} height={16} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
      </div>

      <div>
        <label htmlFor="filter-q" className="mb-1.5 block text-sm font-medium text-gray-700">
          Keyword
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 hover:border-gray-400">
          <Search width={16} height={16} className="shrink-0 text-gray-400" />
          <input
            id="filter-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="City, ZIP, or shop name"
            className="w-full bg-transparent py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="filter-state" className="mb-1.5 block text-sm font-medium text-gray-700">
          State
        </label>
        <select
          id="filter-state"
          value={state}
          onChange={(e) => {
            setState(e.target.value)
            apply({ state: e.target.value })
          }}
          className={selectClass}
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s.state} value={s.state}>
              {s.stateFull} ({s.count})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-service" className="mb-1.5 block text-sm font-medium text-gray-700">
          Service
        </label>
        <select
          id="filter-service"
          value={service}
          onChange={(e) => {
            setService(e.target.value)
            apply({ service: e.target.value })
          }}
          className={selectClass}
        >
          <option value="">Any service</option>
          {services.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
        <input
          type="checkbox"
          checked={mobileOnly}
          onChange={(e) => {
            setMobileOnly(e.target.checked)
            apply({ mobileOnly: e.target.checked })
          }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        />
        Mobile service only
      </label>

      <button
        type="submit"
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Apply filters
      </button>
    </form>
  )
}
