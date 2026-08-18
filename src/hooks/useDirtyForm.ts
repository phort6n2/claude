'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useUnsavedWork } from '@/components/admin/UnsavedWorkGuard'

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
  /**
   * Bumped by commit(), and a dependency of the dirty calculation below.
   *
   * WITHOUT IT A SAVED FORM STAYS DIRTY FOREVER. commit() with no argument
   * settles on the object `values` already holds, so `setValues(settled)`
   * passes React the identical reference and React bails out of the
   * re-render. The memo below is keyed on `values`, which has not changed, so
   * it hands back the cached dirty set — still full — and every later attempt
   * to switch tabs is blocked by work that was saved minutes ago.
   *
   * The baseline is a ref because it must not itself trigger renders. This
   * counter is the one thing that has to say "the baseline moved".
   */
  const [baselineVersion, setBaselineVersion] = useState(0)

  const isEqual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

  const dirtyFields = useMemo(() => {
    const out = new Set<string>()
    for (const key of Object.keys(values) as Array<keyof T>) {
      if (!isEqual(values[key], baseline.current[key])) out.add(String(key))
    }
    return out
  }, [values, baselineVersion])

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
    setBaselineVersion((v) => v + 1)
  }, [values])

  const discard = useCallback(() => {
    setValues(baseline.current)
    setBaselineVersion((v) => v + 1)
  }, [])

  // Report upward so the client tab bar can stop a soft navigation too.
  // beforeunload below covers leaving the DOCUMENT; switching tabs inside the
  // client editor never touches it, which is how a typed-but-unsaved business
  // name used to vanish without a word.
  const formKey = useId()
  const { setDirty } = useUnsavedWork()
  useEffect(() => {
    setDirty(formKey, isDirty)
    return () => setDirty(formKey, false)
  }, [isDirty, formKey, setDirty])

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
