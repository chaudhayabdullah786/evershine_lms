'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportPreviewDocument } from '@/lib/documents/export-preview'

export function DocumentExportSmokeClient() {
  const previewRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)

  const handleDownload = async () => {
    if (!previewRef.current || isExporting) return
    setIsExporting(true)
    try {
      await exportPreviewDocument(previewRef.current, 'document-export-smoke', 'color')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8 text-slate-950">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6">
        <div
          ref={previewRef}
          data-document-page
          className="bg-white text-slate-950 shadow-sm"
          style={{ width: '595px', minHeight: '842px', padding: '48px' }}
        >
          <div className="border-b-4 border-blue-800 pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-800">Evershaheen Academy</p>
            <h1 className="mt-2 text-3xl font-black">Document Export Smoke Test</h1>
            <p className="mt-2 text-sm text-slate-600">Stable fixture used by CI to verify preview capture and PDF export plumbing.</p>
          </div>

          <section className="mt-10 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded border border-slate-300 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Student</p>
              <p className="mt-2 text-lg font-bold">Sample Student</p>
            </div>
            <div className="rounded border border-slate-300 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Registration</p>
              <p className="mt-2 font-mono text-lg font-bold">ESA-SMOKE-001</p>
            </div>
            <div className="rounded border border-slate-300 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Class</p>
              <p className="mt-2 text-lg font-bold">Class 10-A</p>
            </div>
            <div className="rounded border border-slate-300 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Status</p>
              <p className="mt-2 text-lg font-bold text-emerald-700">Verified</p>
            </div>
          </section>

          <div className="mt-12 rounded bg-blue-50 p-6 text-sm leading-7 text-slate-700">
            This page intentionally contains no real student or staff data. It exists only when
            NEXT_PUBLIC_ENABLE_EXPORT_SMOKE is enabled for CI validation.
          </div>
        </div>

        <Button onClick={handleDownload} disabled={isExporting}>
          {isExporting ? 'Generating...' : 'Download Document PDF'}
        </Button>
      </div>
    </main>
  )
}
