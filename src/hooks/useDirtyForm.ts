'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Tracks a form against the values it loaded with, so the UI can always
 * answer "what have I changed and have I saved it?".
 *
 * The editor is split across routed tabs that each save their own fields.
 * That only stays safe if unsaved work is impossible to walk away from
 * silently — hence the dirty set, the browser unload guard, and the
 * confirm-on-navigate helper below.
 */
export function useDirtyForm<T extends object>(initial: T) {
  const [values, setValues] = useState<T>(initial)
  const baseline = useRef<T>(initial)

  const isEqual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

  const dirtyFields = useMemo(() => {
    const out = new Set<string>()
    for (const key of Object.keys(values) as Array<keyof T>) {
      if (!isEqual(values[key], baseline.current[key])) out.add(String(key))
    }
    return out
  }, [values])

  const isDirty = dirtyFields.size > 0

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  /** Only the changed keys — what a partial PATCH should send. */
  const changedPayload = useCallback(() => {
    const out: Record<string, unknown> = {}
    for (const key of dirtyFields) out[key] = (values as Record<string, unknown>)[key]
    return out
  }, [dirtyFields, values])

  /** Call after a successful save so the current values become the new baseline. */
  const commit = useCallback((next?: T) => {
    const settled = next ?? values
    baseline.current = settled
    setValues(settled)
  }, [values])

  const discard = useCallback(() => setValues(baseline.current), [])

  // Browser-level guard (tab close / reload / external link).
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  return { values, setValues, setField, dirtyFields, isDirty, changedPayload, commit, discard }
}

/** True when the user confirms leaving unsaved work (or there is none). */
export function confirmDiscard(isDirty: boolean) {
  if (!isDirty) return true
  return window.confirm('You have unsaved changes on this tab. Leave without saving?')
}
