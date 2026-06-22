'use client'

/**
 * useBannerRotation — Auto-advancing banner index for hero carousel.
 * 
 * Returns activeIndex and setActiveIndex for both auto-advance and
 * manual dot navigation. Interval resets on manual navigation.
 */

import { useState, useEffect, useCallback } from 'react'

export function useBannerRotation(total: number, interval = 6000) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (total <= 1) return

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total)
    }, interval)

    return () => clearInterval(timer)
  }, [total, interval, activeIndex]) // Reset timer when activeIndex changes (manual nav)

  const goTo = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  return { activeIndex, goTo }
}
