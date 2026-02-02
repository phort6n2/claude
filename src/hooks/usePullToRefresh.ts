'use client'

import { useState, useEffect, useCallback } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number // pixels to pull before triggering refresh
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setPullDistance(0)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }, [onRefresh, isRefreshing])

  useEffect(() => {
    let startY = 0
    let currentY = 0

    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if we're at the top of the page
      if (window.scrollY <= 0) {
        startY = e.touches[0].clientY
        setIsPulling(true)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return
      if (window.scrollY > 0) {
        // User scrolled down, cancel pull
        setIsPulling(false)
        setPullDistance(0)
        return
      }

      currentY = e.touches[0].clientY
      const distance = Math.max(0, currentY - startY)

      // Apply resistance - the further you pull, the harder it gets
      const resistedDistance = Math.min(distance * 0.5, threshold * 1.5)
      setPullDistance(resistedDistance)

      // Prevent default scroll when pulling
      if (distance > 10) {
        e.preventDefault()
      }
    }

    const handleTouchEnd = () => {
      if (pullDistance >= threshold && !isRefreshing) {
        handleRefresh()
      } else {
        setPullDistance(0)
      }
      setIsPulling(false)
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isPulling, pullDistance, threshold, isRefreshing, handleRefresh])

  return {
    isRefreshing,
    pullDistance,
    isPulling,
    threshold,
  }
}
