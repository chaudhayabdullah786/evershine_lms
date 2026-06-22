'use client';

import { motion } from 'framer-motion';
import { AcademyLogo } from '@/components/AcademyLogo';

export default function AppLoading() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-soft-xl"
      >
        <div className="mx-auto flex flex-col items-center gap-5">
          <AcademyLogo variant="primary" className="w-16 h-16 animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0ms]" />
            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:150ms]" />
            <div className="w-2 h-2 rounded-full bg-violet-600 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
        <h2 className="mt-5 text-xl font-black text-slate-900">Loading LMS…</h2>
        <p className="mt-2 text-sm text-slate-500">Preparing your experience and loading the latest data safely.</p>
      </motion.div>
    </main>
  );
}
