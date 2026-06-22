'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { fetchPaginatedApi } from '@/lib/api-client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wallet, ReceiptText, CalendarDays, TrendingUp, Download, Banknote, CreditCard, BarChart2, FileText } from 'lucide-react'
import { notify } from '@/lib/notify'

interface ExpenseRecord {
  id: string
  title: string
  category: string
  amount: string | number
  date: string
  isApproved: boolean
  notes?: string | null
  accountant?: { firstName?: string; lastName?: string }
}

export default function AccountantDashboardPage() {
  const { data: session, status } = useSession()
  const role = (session?.user?.role as string) || ''

  const canAccess = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(role)

  const { data, isLoading } = useQuery({
    queryKey: ['accountant-expenses-dashboard'],
    queryFn: () => fetchPaginatedApi<ExpenseRecord>('/api/accountant/expenses?limit=8'),
    enabled: canAccess,
  })

  const { data: leaveSummary, isLoading: isLoadingLeaveSummary } = useQuery({
    queryKey: ['accountant-leave-summary'],
    queryFn: () => fetchPaginatedApi<{ id: string }>('/api/leaves?limit=1'),
    enabled: canAccess,
  })

  const leaveCount = leaveSummary?.pagination.total ?? 0
  const expenses = useMemo(() => data?.data ?? [], [data?.data])

  const exportSummary = async () => {
    try {
      const response = await fetch('/api/accountant/expenses/export', { credentials: 'same-origin' })
      if (!response.ok) throw new Error('Unable to generate the expense export.')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `accountant-expenses-${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      notify.success('Expense report downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The export could not be created.'
      notify.error('Unable to export expenses', { description: message })
    }
  }

  const summary = useMemo(() => {
    const currentMonth = new Date()
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)

    const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const thisMonth = expenses.filter((item) => new Date(item.date) >= monthStart).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const approved = expenses.filter((item) => item.isApproved).length
    const categories = new Set(expenses.map((item) => item.category)).size

    return { total, thisMonth, approved, categories }
  }, [expenses])

  if (status === 'loading') return null
  if (!canAccess) {
    return (
      <AccessDenied
        title="Finance Workspace Access"
        message="Only finance staff and admins can open the accounting workspace."
      />
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Accounting Hub</p>
          <h1 className="text-2xl font-black text-slate-900">Finance workspace overview</h1>
          <p className="text-sm text-slate-500">This dedicated finance workspace keeps campus expenses, payroll, and reporting aligned for approved finance staff.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportSummary} className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50">
            <Download className="h-4 w-4" /> Export report
          </Button>
          <Button asChild variant="secondary" className="gap-2 border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100">
            <Link href="/dashboard/accountant/reports">
              <BarChart2 className="h-4 w-4" /> Financial Reports
            </Link>
          </Button>
          <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white">
            <Link href="/dashboard/accountant/expenses">Record an expense</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Total expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black">{formatCurrency(summary.total)}</span>
              <Wallet className="h-5 w-5 text-teal-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">This month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black">{formatCurrency(summary.thisMonth)}</span>
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Approved entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black">{summary.approved}</span>
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Categories used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black">{summary.categories}</span>
              <ReceiptText className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-100 bg-amber-50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm text-slate-500">Leave request queue</CardTitle>
          <CardDescription>Review the leave dashboard for all staff and student requests.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-3xl font-black text-slate-900">{isLoadingLeaveSummary ? 'Loading…' : leaveCount}</p>
            <p className="text-sm text-slate-600">Total leave requests pending or in review.</p>
          </div>
          <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
            <Link href="/dashboard/leaves">Open Leaves Hub</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-teal-100 bg-teal-50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Profit & Loss reporting</CardTitle>
          <CardDescription>Jump to period statements, reserve fund allocations, and exports from one place.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-600 max-w-2xl">
              Generate P&L snapshots, review gross margin performance, and track reserve fund contributions for your campus or institution.
            </p>
          </div>
          <Button asChild className="bg-teal-700 text-white hover:bg-teal-800 gap-2">
            <Link href="/dashboard/accountant/reports" className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Open Financial Reports
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Account manager finance blueprint</CardTitle>
          <CardDescription>Open the new frontend design guide for pricing, payments, proofs, and payroll workflows.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-600 max-w-2xl">
              This page makes the accountant finance spec visible in the LMS UI and links finance staff directly to the new implementation guide.
            </p>
          </div>
          <Button asChild className="bg-teal-600 text-white hover:bg-teal-700 gap-2">
            <Link href="/dashboard/accountant/design-docs" className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Open Finance Blueprint
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <CardHeader>
          <CardTitle className="text-base">Finance essentials</CardTitle>
          <CardDescription>Jump straight to the core finance workflows used by account managers, admins, and finance staff.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Button asChild variant="outline" className="h-auto justify-start gap-3 border-teal-200 bg-white p-4 text-left hover:bg-teal-50">
            <Link href="/dashboard/fees">
              <CreditCard className="h-4 w-4 text-teal-600" />
              <span>
                <span className="block font-semibold text-slate-900">Fee collection</span>
                <span className="text-xs text-slate-500">Invoice, payment, and proof review workflow</span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start gap-3 border-amber-200 bg-white p-4 text-left hover:bg-amber-50">
            <Link href="/dashboard/accountant/expenses">
              <ReceiptText className="h-4 w-4 text-amber-600" />
              <span>
                <span className="block font-semibold text-slate-900">Expense ledger</span>
                <span className="text-xs text-slate-500">Capture campus expenses and export reports</span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start gap-3 border-indigo-200 bg-white p-4 text-left hover:bg-indigo-50">
            <Link href="/dashboard/accountant/salary-slips">
              <Banknote className="h-4 w-4 text-indigo-600" />
              <span>
                <span className="block font-semibold text-slate-900">Payroll slips</span>
                <span className="text-xs text-slate-500">Generate and distribute staff salary records</span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start gap-3 border-emerald-200 bg-white p-4 text-left hover:bg-emerald-50">
            <Link href="/dashboard/accountant/reports">
              <ReceiptText className="h-4 w-4 text-emerald-600" />
              <span>
                <span className="block font-semibold text-slate-900">Financial reports</span>
                <span className="text-xs text-slate-500">Unified ledger, profit & loss, reserve allocations</span>
              </span>
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent expense activity</CardTitle>
          <CardDescription>Latest campus expense records are immediately available to finance reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading recent records…</p>
          ) : expenses.length === 0 ? (
            <p className="text-sm text-slate-500">No expenses recorded yet for this campus.</p>
          ) : (
            expenses.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                    <Badge variant="secondary">{item.category}</Badge>
                    {item.isApproved && <Badge className="bg-emerald-100 text-emerald-700">Approved</Badge>}
                  </div>
                  <p className="text-sm text-slate-500">{item.notes || 'No additional notes provided.'}</p>
                  <p className="text-xs text-slate-400">Recorded on {formatDate(item.date)} by {item.accountant?.firstName || 'Accountant'} {item.accountant?.lastName || ''}</p>
                </div>
                <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
