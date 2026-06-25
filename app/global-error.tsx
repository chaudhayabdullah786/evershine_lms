'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

// WHY: Chunk load errors happen when a new deployment invalidates JS bundles
// cached or referenced by a still-open browser tab. They are always recoverable
// by a hard reload and must never be shown as raw module errors to end users.
function isChunkError(err: Error): boolean {
  const msg = err?.message ?? ''
  return (
    msg.includes('Failed to load chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('from module')
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    // Always log the real error for operators — never swallow silently
    console.error('[GlobalError]', error)

    // For chunk errors: auto-reload after 3 seconds (new deployment deployed,
    // old chunks are gone — only a reload can fix this transparently).
    if (isChunkError(error)) {
      setCountdown(3)
    }
  }, [error])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      window.location.reload()
      return
    }
    const t = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const isChunk = isChunkError(error)

  // User-friendly message — never expose internal chunk/module paths
  const userMessage = isChunk
    ? 'The page needs to reload to load the latest version. This happens automatically after an update.'
    : 'We could not load this page safely. Please refresh or try again.'

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <main className="flex min-h-screen items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-soft-xl"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-2xl font-black text-slate-900">
              {isChunk ? 'Update Available' : 'Something went wrong'}
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              {userMessage}
            </p>

            {isChunk && countdown !== null && (
              <p className="mt-2 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700 font-medium">
                Reloading automatically in {countdown}s…
              </p>
            )}

            {!isChunk && error.digest && (
              <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-400 font-mono">
                Ref: {error.digest}
              </p>
            )}

            <button
              onClick={() => isChunk ? window.location.reload() : reset()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 active:scale-95"
            >
              <RefreshCcw className="h-4 w-4" />
              {isChunk ? 'Reload now' : 'Try again'}
            </button>
          </motion.div>
        </main>
      </body>
    </html>
  );
}
