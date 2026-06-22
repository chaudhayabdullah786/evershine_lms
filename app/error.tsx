'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';
import { AcademyLogo } from '@/components/AcademyLogo';

export default function ErrorPage({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service if needed
    console.error(error);
  }, [error]);

  const formatErrorValue = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value instanceof Error) return value.message || String(value)

    const cast = value as { toString?: () => string }
    if (cast && typeof cast.toString === 'function') {
      const text = cast.toString()
      if (text !== '[object Object]') return text
    }

    try {
      const json = JSON.stringify(value, null, 2)
      return json && json !== '{}' ? json : 'An unexpected error occurred.'
    } catch {
      return 'An unexpected error occurred.'
    }
  }

  const errorMessage = formatErrorValue(
    (error as { message?: unknown })?.message ?? error
  )
  const errorDigest = formatErrorValue(
    (error as { digest?: unknown })?.digest ?? ''
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* Background patterns */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      </div>

      <div className="relative w-full max-w-lg text-center space-y-8 bg-white p-10 rounded-[2rem] border border-slate-200 shadow-soft-xl">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
          className="mx-auto w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6"
        >
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </motion.div>

        <div className="space-y-4">
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-3xl font-extrabold text-slate-900"
          >
            System Error
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-slate-600 max-w-sm mx-auto leading-relaxed"
          >
            We could not load this page safely. Please try again, or return to the dashboard. We keep LMS errors user-friendly and never show raw Next.js stack traces to end users.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {errorMessage || 'A temporary issue occurred while loading this screen.'}
          </motion.div>

          {errorDigest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-4 p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-500 font-mono text-left overflow-x-auto"
            >
              Error Digest: {errorDigest}
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
        >
          <button
            onClick={() => reset()}
            className="group flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-full bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all active:scale-95 shadow-md hover:shadow-lg"
          >
            <RefreshCcw className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" />
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="group flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-full bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm hover:shadow-md"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </motion.div>
        
        <div className="pt-8 border-t border-slate-100 mt-8">
            <AcademyLogo variant="compact" className="w-8 h-8 mx-auto opacity-50 grayscale" />
        </div>
      </div>
    </div>
  );
}
