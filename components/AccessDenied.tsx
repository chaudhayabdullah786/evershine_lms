'use client'

import { ShieldX } from 'lucide-react'

interface AccessDeniedProps {
  title?: string
  message?: string
}

/**
 * Full-page access restriction banner.
 * Rendered when the authenticated user's role is not permitted to view a page.
 * WHY: Keeps the user inside the dashboard shell rather than redirecting,
 * giving a cleaner UX and a clear explanation of the restriction.
 */
export function AccessDenied({
  title = 'Access Restricted',
  message = 'You do not have permission to access this section. Please contact your administrator if you believe this is an error.',
}: AccessDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] max-w-md mx-auto text-center p-8 space-y-5">
      <div className="p-5 bg-rose-50 rounded-2xl border border-rose-200 text-rose-500">
        <ShieldX className="w-14 h-14" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">{title}</h2>
        <p className="text-slate-500 text-sm leading-relaxed">{message}</p>
      </div>
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full border border-slate-200 text-slate-400 text-xs font-semibold select-none">
        <ShieldX className="w-3.5 h-3.5" />
        Unauthorized Access Attempt Blocked
      </div>
    </div>
  )
}
