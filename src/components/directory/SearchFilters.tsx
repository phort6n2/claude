'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
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
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Keyword</label>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3">
          <Search width={16} height={16} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="City, ZIP, or shop name"
            className="w-full py-2 text-sm outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value)
            apply({ state: e.target.value })
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
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
        <label className="mb-1 block text-sm font-medium text-gray-700">Service</label>
        <select
          value={service}
          onChange={(e) => {
            setService(e.target.value)
            apply({ service: e.target.value })
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
        >
          <option value="">Any service</option>
          {services.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={mobileOnly}
          onChange={(e) => {
            setMobileOnly(e.target.checked)
            apply({ mobileOnly: e.target.checked })
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
        Mobile service only
      </label>

      <button
        type="submit"
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Apply filters
      </button>
    </form>
  )
}
