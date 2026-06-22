import { Suspense } from 'react'

export default function AcademicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading academic engine…</div>}>
      {children}
    </Suspense>
  )
}
