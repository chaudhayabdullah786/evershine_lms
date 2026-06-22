'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
            <h1 className="mt-6 text-2xl font-black text-slate-900">Something went wrong</h1>
            <p className="mt-3 text-sm text-slate-600">
              We could not load this page safely. Please refresh or try again. We intentionally hide technical stack traces from LMS users.
            </p>
            <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {error.message || 'A temporary issue occurred while opening this page.'}
            </p>
            <button
              onClick={() => reset()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
            >
              <RefreshCcw className="h-4 w-4" />
              Try again
            </button>
          </motion.div>
        </main>
      </body>
    </html>
  );
}
