'use client'

/**
 * AnnouncementTicker — Enhanced scrolling marquee bar.
 *
 * Upgraded from single-string to structured multi-item ticker.
 * Each item rendered with separator dots between them.
 * Professional typography — no emojis per spec rule #10.
 *
 * Features:
 * - CSS marquee animation with smooth loop
 * - Pause on hover
 * - Reduced-motion: shows static text
 * - Pull items from SITE_CONFIG.tickerItems[] or fallback to text prop
 */

import { SITE_CONFIG } from '@/content/site-config'

interface AnnouncementTickerProps {
  text: string
}

export default function AnnouncementTicker({ text }: AnnouncementTickerProps) {
  const tickerItems = SITE_CONFIG.tickerItems ?? []
  const hasStructuredItems = tickerItems.length > 0

  return (
    <div
      style={{
        backgroundColor: '#1B4F8A',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        padding: '12px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
      role="marquee"
      aria-label="Academy announcements"
    >
      <div className="lp-marquee-track">
        {/* Duplicate content for seamless loop */}
        {[0, 1].map((loop) => (
          <span
            key={loop}
            style={{
              display: 'inline-block',
              paddingRight: '40px',
            }}
          >
            {hasStructuredItems ? (
              tickerItems.map((item, i) => (
                <span key={`${loop}-${i}`} style={{ display: 'inline' }}>
                  {/* Star separator */}
                  <span
                    style={{
                      display: 'inline-block',
                      margin: '0 20px',
                      color: '#F5A623',
                      fontSize: '0.7rem',
                      verticalAlign: 'middle',
                    }}
                  >
                    ★
                  </span>
                  {/* Ticker item text */}
                  <span
                    style={{
                      display: 'inline',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: '#FFFFFF',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {item}
                  </span>
                </span>
              ))
            ) : (
              <span
                style={{
                  display: 'inline-block',
                  paddingRight: '80px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  letterSpacing: '0.02em',
                }}
              >
                {text}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
