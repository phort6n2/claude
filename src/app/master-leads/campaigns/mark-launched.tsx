'use client'

import { useEffect } from 'react'
import { markLaunched } from '@/lib/master-leads-launch'

/** A launch that lands HERE first (an icon saved from this page) must still
 *  let the back arrow reach the leads list rather than bounce back. */
export function MarkLaunched() {
  useEffect(() => markLaunched(), [])
  return null
}
