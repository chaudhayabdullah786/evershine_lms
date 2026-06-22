import Link from 'next/link'
import { ArrowUpRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AccountantDesignDocsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Accountant Blueprint</p>
        <h1 className="text-3xl font-black text-slate-900">Finance feature design and implementation guide</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          This page makes the account manager finance improvements visible inside the LMS UI. It documents the enhanced fee collection workflow, screenshot proof approval, and salary slip delivery system for finance staff.
        </p>
      </div>

      <Card className="border-teal-100 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">What’s included</CardTitle>
          <CardDescription>All major enhancements are now surfaced as frontend actions and design reference points.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-teal-600" />
              Enhanced fee pipeline with multi-status payment handling and penalty rules.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-teal-600" />
              Proof submission review workflow for student screenshot receipts.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-teal-600" />
              Salary slip generation, preview, and delivery to staff modules.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-teal-600" />
              Audit trail, validation logic, and analytics summaries for finance performance.
            </li>
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild className="bg-teal-600 text-white hover:bg-teal-700 gap-2">
              <Link href="/dashboard/accountant/fees">
                <FileText className="h-4 w-4" /> Explore Fee Collection
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50">
              <Link href="/dashboard/accountant/reports">
                <ArrowUpRight className="h-4 w-4" /> Open Financial Reports
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-slate-50 shadow-sm">
        <CardHeader>
          <CardTitle>Reference docs</CardTitle>
          <CardDescription>Professional design guidance is backed by repository documentation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            The full implementation specification is available inside the repository documentation and is linked from this page to ensure frontend visibility matches backend design.
          </p>
          <Button asChild variant="secondary" className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
            <a href="/Documentation/Account_Manager_Finance_Features_Spec.md" target="_blank" rel="noreferrer noopener">
              <FileText className="h-4 w-4" /> Open Design Spec
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
