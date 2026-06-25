'use client'

/**
 * app/error.tsx — Route-Level Error Boundary
 *
 * WHY separate from global-error.tsx:
 *  - global-error.tsx catches errors in the root html/body layout shell
 *  - error.tsx catches errors thrown by any page render inside the app
 *
 * Without this file those errors propagate to global-error.tsx, which
 * replaces the entire HTML document — sidebar, header, and layout are lost.
 * With this file, only the page content area is replaced, preserving nav.
 *
 * SECURITY: We NEVER expose error.message, stack traces, or module paths to
 * the browser. All internal detail is only written to console (server logs).
 * End users only ever see a sanitised, friendly message.
 *
 * Handled failure modes:
 *  1. ChunkLoadError / stale-bundle 404 (deployment rollover) → auto-reload
 *  2. API fetch errors that bubble past useQuery boundaries → "try again"
 *  3. Hydration errors, unexpected null-ref → "try again"
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'
import Link from 'next/link'
import { AcademyLogo } from '@/components/AcademyLogo'

// WHY: Chunk errors are a deployment artifact, not an application bug.
// The only correct resolution is a hard reload — not a React reset().
function isChunkError(err: Error): boolean {
  const msg = err?.message ?? ''
  return (
    msg.includes('Failed to load chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('from module')
  )
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [countdown, setCountdown] = useState<number | null>(null)
  const isChunk = isChunkError(error)

  useEffect(() => {
    // Preserve full error detail in server/browser logs for operators.
    // This is the only place the real error.message is ever referenced.
    console.error('[RouteError]', {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    })

    // For chunk errors: trigger auto-reload countdown.
    if (isChunk) setCountdown(3)
  }, [error, isChunk])

  // Auto-reload countdown tick
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      window.location.reload()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // User-visible message: generic only — no internal path or module reference.
  const userMessage = isChunk
    ? 'The page needs to reload to load the latest version. This happens automatically after an update.'
    : 'We could not load this page safely. Please try again, or return to the dashboard.'

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 bg-slate-50/50">
      {/* Soft background accent */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      </div>

      <div className="relative w-full max-w-lg text-center space-y-6 bg-white p-10 rounded-[2rem] border border-slate-200 shadow-lg">
        {/* Status icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.68, -0.55, 0.265, 1.55] }}
          className="mx-auto w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center"
        >
          <AlertTriangle className="w-10 h-10 text-amber-500" />
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-2xl font-extrabold text-slate-900"
        >
          {isChunk ? 'Update Available' : 'Page Error'}
        </motion.h1>

        {/* Generic user message — never contains internal detail */}
        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-slate-500 leading-relaxed text-sm max-w-sm mx-auto"
        >
          {userMessage}
        </motion.p>

        {/* Countdown pill (chunk errors only) */}
        {isChunk && countdown !== null && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-2.5 text-sm text-blue-700 font-semibold"
          >
            Reloading automatically in {countdown}s…
          </motion.p>
        )}

        {/* Opaque digest reference for support — safe, contains no stack info */}
        {!isChunk && error.digest && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-400 font-mono"
          >
            Reference: {error.digest}
          </motion.p>
        )}

        {/* Recovery actions */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2"
        >
          <button
            onClick={() => (isChunk ? window.location.reload() : reset())}
            className="group flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all active:scale-95 shadow-md"
          >
            <RefreshCcw className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" />
            {isChunk ? 'Reload now' : 'Try again'}
          </button>

          <Link
            href="/dashboard"
            className="group flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </motion.div>

        {/* Academy brand mark */}
        <div className="pt-6 border-t border-slate-100">
          <AcademyLogo variant="compact" className="w-7 h-7 mx-auto opacity-40 grayscale" />
        </div>
      </div>
    </div>
  )
}
