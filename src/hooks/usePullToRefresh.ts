'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number // pixels to pull before triggering refresh
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  // Use refs for values needed in event handlers to avoid stale closures
  const isPullingRef = useRef(false)
  const isRefreshingRef = useRef(false)
  const startYRef = useRef(0)
  const pullDistanceRef = useRef(0)

  // Keep refs in sync with state
  isRefreshingRef.current = isRefreshing
  pullDistanceRef.current = pullDistance

  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return
    setIsRefreshing(true)
    isRefreshingRef.current = true
    setPullDistance(0)
    pullDistanceRef.current = 0
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
      isRefreshingRef.current = false
    }
  }, [onRefresh])

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if we're at the very top of the page
      if (window.scrollY <= 0 && !isRefreshingRef.current) {
        startYRef.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return

      // If user has scrolled down at all, cancel pull-to-refresh
      if (window.scrollY > 0) {
        isPullingRef.current = false
        setPullDistance(0)
        pullDistanceRef.current = 0
        return
      }

      const currentY = e.touches[0].clientY
      const distance = currentY - startYRef.current

      // Only activate pull-to-refresh for downward swipes (positive distance)
      if (distance <= 0) {
        isPullingRef.current = false
        setPullDistance(0)
        pullDistanceRef.current = 0
        return
      }

      // Apply resistance - the further you pull, the harder it gets
      const resistedDistance = Math.min(distance * 0.5, threshold * 1.5)
      setPullDistance(resistedDistance)
      pullDistanceRef.current = resistedDistance

      // Only prevent default scroll when actively pulling down from top
      if (distance > 10 && window.scrollY <= 0) {
        e.preventDefault()
      }
    }

    const handleTouchEnd = () => {
      if (isPullingRef.current && pullDistanceRef.current >= threshold && !isRefreshingRef.current) {
        handleRefresh()
      } else {
        setPullDistance(0)
        pullDistanceRef.current = 0
      }
      isPullingRef.current = false
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [threshold, handleRefresh])

  return {
    isRefreshing,
    pullDistance,
    isPulling: isPullingRef.current,
    threshold,
  }
}
