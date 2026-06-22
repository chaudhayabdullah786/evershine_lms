'use client'

/**
 * AuthLayout — Unified auth shell for EverShine Academy LMS.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * ─────────────────────────
 * Background:  bg-slate-50 with subtle blue-400/10 radial blobs (matches homepage hero)
 * Card:        bg-white/95, border-slate-200, rounded-3xl, shadow-soft-lg (matches Card component)
 * Inputs:      ShadCN <Input> — rounded-2xl, border-slate-200, focus:border-indigo-400
 * Buttons:     ShadCN <Button> — gradient from-blue-600 via-indigo-600 to-violet-600
 * Typography:  Inter (body), Manrope (headings) — project font stacks
 * Colors:      --primary (blue-600), --secondary (emerald-600), --accent (amber-500)
 * Logo:        AcademyLogo component with /api/logo (bglogo.png)
 * Animation:   framer-motion with project easing [0, 0, 0.2, 1]
 *
 * NO dark glass. NO dark navy. NO custom inputs.
 * Follows the exact same language as page.tsx (homepage), dashboard cards, and ShadCN components.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Shield, ArrowLeft } from 'lucide-react'
import { AcademyLogo } from '@/components/AcademyLogo'
import { ArcLineBrand } from '@/components/ArcLineBrand'

// ─── CONFIG ───────────────────────────────────────────────────────────────────

interface AuthLayoutProps {
  children: React.ReactNode
  pageType: 'login' | 'forgot-password' | 'reset-password'
}

const PAGE = {
  login: {
    title:    'Sign In to Your Portal',
    sub:      'Access your dashboard, manage academics, and stay connected.',
    back:     null,
  },
  'forgot-password': {
    title:    'Recover Your Account',
    sub:      'We\'ll send a secure reset link to your registered email.',
    back:     { href: '/login', label: 'Back to Sign In' },
  },
  'reset-password': {
    title:    'Create New Password',
    sub:      'Choose a strong password to secure your account.',
    back:     { href: '/login', label: 'Back to Sign In' },
  },
}

const SLOGAN_WORDS = ['We', 'Make', 'Your', 'Children', 'More', 'Valuable']

// Project-standard easing (from page.tsx fadeUp)
const EASE = [0, 0, 0.2, 1] as const

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay } },
})

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function AuthLayout({ children, pageType }: AuthLayoutProps) {
  const cfg = PAGE[pageType]
  const [ready, setReady] = useState(false)

  useEffect(() => { setReady(true) }, [])

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 px-4 py-10 sm:py-16 overflow-hidden">

      {/* ══════════════════════════════════════════════════════════════════════
          BACKGROUND — Matches homepage hero: subtle blue/emerald radial blobs
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-indigo-400/[0.04] blur-3xl" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER BAR — Consistent with homepage navbar style
      ══════════════════════════════════════════════════════════════════════ */}
      <header className="fixed top-0 left-0 right-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <AcademyLogo variant="compact" className="h-10 w-10" />
            <div>
              <p className="text-sm font-bold tracking-wide text-slate-800">EverShine Academy</p>
              <p className="text-xs text-slate-500">Professional LMS</p>
            </div>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            <Shield className="w-3.5 h-3.5" />
            Secured Portal
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          CENTERED CARD — Matches project Card component:
          bg-white/95, border-slate-200, rounded-3xl, shadow-soft-lg
      ══════════════════════════════════════════════════════════════════════ */}
      <motion.div
        {...fadeUp(0.1)}
        className="relative z-10 w-full max-w-[440px] mt-16 sm:mt-20"
      >
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-soft-lg overflow-hidden">

          {/* Gradient accent top bar — uses project primary gradient */}
          <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />

          {/* Card inner */}
          <div className="px-7 sm:px-9 pt-8 pb-7 space-y-6">

            {/* ── LOGO + ACADEMY IDENTITY ── */}
            <motion.div
              {...fadeUp(0.2)}
              className="flex flex-col items-center text-center gap-4"
            >
              {/* Logo — uses AcademyLogo primary variant at proper scale */}
              <AcademyLogo variant="primary" className="w-24 h-24" />

              {/* Academy name — matches homepage font treatment */}
              <div>
                <p className="text-[10px] font-bold tracking-[0.3em] text-blue-700 uppercase mb-1">
                  Official Portal
                </p>
                <h2 className="text-lg font-extrabold text-slate-900 tracking-wide uppercase leading-none" style={{ fontFamily: 'var(--font-manrope)' }}>
                  EverShine Academy
                </h2>
              </div>

              {/* ── SLOGAN — word-by-word fade & slide up ── */}
              <div className="overflow-hidden">
                <motion.p
                  className="text-sm font-semibold text-slate-500 leading-relaxed"
                  aria-label="We Make Your Children More Valuable"
                  initial="initial"
                  animate={ready ? 'animate' : 'initial'}
                  variants={{ initial: {}, animate: { transition: { staggerChildren: 0.07, delayChildren: 0.5 } } }}
                >
                  &ldquo;
                  {SLOGAN_WORDS.map((word, i) => (
                    <motion.span
                      key={i}
                      variants={{
                        initial: { opacity: 0, y: 12 },
                        animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
                      }}
                      className="inline"
                    >
                      {word}{i < SLOGAN_WORDS.length - 1 ? '\u00a0' : ''}
                    </motion.span>
                  ))}
                  &rdquo;
                </motion.p>
              </div>
            </motion.div>

            {/* ── DIVIDER ── */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={ready ? { scaleX: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.55, ease: EASE }}
              style={{ transformOrigin: 'left' }}
              className="h-px bg-slate-200"
            />

            {/* ── PAGE TITLE ── */}
            <motion.div
              {...fadeUp(0.6)}
              className="text-center space-y-1.5"
            >
              <h1
                className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                {cfg.title}
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                {cfg.sub}
              </p>
            </motion.div>

            {/* ── FORM CONTENT — passed as children ── */}
            <motion.div {...fadeUp(0.72)}>
              {children}
            </motion.div>

            {/* ── BACK LINK (forgot/reset only) ── */}
            {cfg.back && (
              <motion.div {...fadeUp(0.85)} className="flex items-center justify-center">
                <Link
                  href={cfg.back.href}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700 transition-colors rounded-xl py-1.5 px-3 hover:bg-blue-50"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {cfg.back.label}
                </Link>
              </motion.div>
            )}
          </div>
        </div>

        {/* ── BOTTOM UTILITY LINKS — matches footer typography ── */}
        <motion.div
          {...fadeUp(1.0)}
          className="flex items-center justify-center gap-5 mt-5 text-[11px] text-slate-400"
        >
          <Link href="/" className="hover:text-blue-700 transition-colors">Home</Link>
          <span aria-hidden>·</span>
          <a href="mailto:info@evershaheen.edu.pk" className="hover:text-blue-700 transition-colors">Support</a>
          <span aria-hidden>·</span>
          <span>Madina Town, Faisalabad</span>
        </motion.div>

        {/* ── COPYRIGHT ── */}
        <motion.p
          {...fadeUp(1.1)}
          className="text-center text-[10px] text-slate-400 mt-2"
        >
          © {new Date().getFullYear()} EverShine Academy. All rights reserved.
        </motion.p>
        <motion.div {...fadeUp(1.15)} className="text-center mt-1">
          <ArcLineBrand prefix="Developed by" />
        </motion.div>
      </motion.div>
    </main>
  )
}
