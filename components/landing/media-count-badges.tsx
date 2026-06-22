'use client'

/**
 * MediaCountBadges — Client-only media count badges for AcademyMemories.
 *
 * WHY a separate file: This component is imported via next/dynamic({ ssr: false })
 * in academy-memories.tsx. This ensures the component NEVER renders on the server,
 * making hydration mismatch structurally impossible — React has no SSR node to
 * compare against.
 *
 * The useState+useEffect "mounted" pattern failed in Next.js 16 + React 19
 * concurrent hydration mode because React can interleave effect execution with
 * hydration reconciliation. next/dynamic is the only framework-level guarantee.
 */

import { motion } from 'framer-motion'
import { Camera, Film } from 'lucide-react'

interface MediaCountBadgesProps {
  imageCount: number
  videoCount: number
}

export default function MediaCountBadges({ imageCount, videoCount }: MediaCountBadgesProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
      <motion.span
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 18px',
          borderRadius: '24px',
          backgroundColor: 'rgba(27, 79, 138, 0.3)',
          border: '1px solid rgba(27, 79, 138, 0.4)',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#7EB8F5',
        }}
      >
        <Camera size={14} />
        {imageCount} Photos
      </motion.span>
      {videoCount > 0 && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '24px',
            backgroundColor: 'rgba(245, 166, 35, 0.15)',
            border: '1px solid rgba(245, 166, 35, 0.3)',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#F5A623',
          }}
        >
          <Film size={14} />
          {videoCount} Videos
        </motion.span>
      )}
    </div>
  )
}
