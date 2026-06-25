'use client'

import { useEffect, useRef, useState } from 'react'

interface DeferredSectionProps {
  children: () => React.ReactNode
  minHeight?: number
  rootMargin?: string
}

export default function DeferredSection({
  children,
  minHeight = 320,
  rootMargin = '700px 0px',
}: DeferredSectionProps) {
  const [shouldRender, setShouldRender] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (shouldRender) return

    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [rootMargin, shouldRender])

  if (shouldRender) return <>{children()}</>

  return <div ref={ref} aria-hidden="true" style={{ minHeight }} />
}
