"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function TeacherGradingRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/teacher/grade-entry')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Legacy grading workflow retired</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The previous grading schema page has been replaced by the new Grade Entry experience. You are being redirected to the current workflow.
        </p>
        <Button className="mt-8 inline-flex items-center justify-center gap-2" onClick={() => router.push('/dashboard/teacher/grade-entry')}>
          Open Grade Entry
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
