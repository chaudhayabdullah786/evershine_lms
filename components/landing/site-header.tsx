'use client'

/**
 * SiteHeader — Landing page navigation header.
 * 
 * Behavior:
 * - Default: transparent over hero image (white text/logo)
 * - On scroll > 80px: white background + blur + nav shadow
 * - Mobile: hamburger → full-screen overlay
 * - "Apply Now" triggers student application modal
 */

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { AcademyLogo } from '@/components/AcademyLogo'

interface SiteHeaderProps {
  onApplyClick: () => void
}

const NAV_LINKS = [
  { label: 'Home', href: '#hero' },
  { label: 'About', href: '#about' },
  { label: 'Programs', href: '#programs' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Contact', href: '#contact' },
]

export default function SiteHeader({ onApplyClick }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false)
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          transition: 'all 0.3s ease',
          backgroundColor: scrolled ? 'rgba(255,255,255,0.97)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          boxShadow: scrolled ? '0 2px 16px rgba(27, 79, 138, 0.08)' : 'none',
        }}
      >
        <div className="lp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          {/* Logo */}
          <a href="#hero" onClick={(e) => { e.preventDefault(); handleNavClick('#hero') }}
             style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <AcademyLogo variant="compact" theme={scrolled ? '' : 'mono-white'} />
          </a>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }} className="hidden lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => { e.preventDefault(); handleNavClick(link.href) }}
                style={{
                  color: scrolled ? '#1A1A2E' : '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#F5A623')}
                onMouseLeave={(e) => (e.currentTarget.style.color = scrolled ? '#1A1A2E' : '#FFFFFF')}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="hidden lg:flex">
            <a
              href="/login"
              style={{
                padding: '8px 20px',
                borderRadius: '10px',
                borderWidth: '1.5px',
                borderStyle: 'solid',
                borderColor: scrolled ? '#1B4F8A' : '#FFFFFF',
                color: scrolled ? '#1B4F8A' : '#FFFFFF',
                fontSize: '0.85rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
            >
              LMS Login
            </a>
            <button
              onClick={onApplyClick}
              style={{
                padding: '8px 24px',
                borderRadius: '10px',
                backgroundColor: '#E8330A',
                color: '#FFFFFF',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(232, 51, 10, 0.3)',
                transition: 'all 0.2s',
              }}
            >
              Apply Now
            </button>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            style={{
              background: 'none',
              border: 'none',
              color: scrolled ? '#1A1A2E' : '#FFFFFF',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            backgroundColor: '#1B4F8A',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'none', border: 'none', color: '#FFF', cursor: 'pointer',
            }}
          >
            <X size={32} />
          </button>

          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => { e.preventDefault(); handleNavClick(link.href) }}
              style={{
                color: '#FFFFFF',
                fontSize: '1.5rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          ))}

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', width: '80%', maxWidth: '300px' }}>
            <a
              href="/login"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '14px',
                border: '2px solid #FFF',
                borderRadius: '10px',
                color: '#FFF',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              LMS Login
            </a>
            <button
              onClick={() => { setMobileMenuOpen(false); onApplyClick() }}
              style={{
                padding: '14px',
                backgroundColor: '#E8330A',
                color: '#FFF',
                borderRadius: '10px',
                border: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Apply Now
            </button>
          </div>
        </div>
      )}
    </>
  )
}
