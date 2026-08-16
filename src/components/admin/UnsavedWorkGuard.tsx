'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

/**
 * Whether any form on the current client tab has unsaved work.
 *
 * `useDirtyForm` already guards the browser's own navigation — closing the
 * tab, reloading, following an external link. It could not guard the client
 * tab bar, because that is a soft route change inside the same document and
 * `beforeunload` never fires for it. So the guard covered the ways you rarely
 * leave a tab and missed the way you always do: typing a new business name,
 * clicking "Website", and coming back to find the field as it was, with no
 * dialog and nothing to say the work was thrown away.
 *
 * A ref rather than state for the read path: `ClientTabs` needs the answer
 * inside a click handler, and a value read there must be the value now, not
 * the value at last render.
 */
interface UnsavedWork {
  /** Called by a form whenever its dirty state changes. */
  setDirty: (key: string, dirty: boolean) => void
  /** True when any registered form has unsaved changes. */
  isDirty: () => boolean
}

const Ctx = createContext<UnsavedWork | null>(null)

export function UnsavedWorkProvider({ children }: { children: React.ReactNode }) {
  const dirtyKeys = useRef(new Set<string>())
  const [, force] = useState(0)

  const setDirty = useCallback((key: string, dirty: boolean) => {
    const had = dirtyKeys.current.has(key)
    if (dirty === had) return
    if (dirty) dirtyKeys.current.add(key)
    else dirtyKeys.current.delete(key)
    // Only to keep anything rendering off this in step; the click path reads
    // the ref directly.
    force((n) => n + 1)
  }, [])

  const isDirty = useCallback(() => dirtyKeys.current.size > 0, [])

  return <Ctx.Provider value={{ setDirty, isDirty }}>{children}</Ctx.Provider>
}

/**
 * For a form: report its dirty state up. Safe to call outside the provider —
 * forms are reused on pages that have no tab bar.
 */
export function useUnsavedWork(): UnsavedWork {
  return (
    useContext(Ctx) ?? {
      setDirty: () => {},
      isDirty: () => false,
    }
  )
}
