'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  Receipt,
  Download,
  Calendar,
  X,
  FileSpreadsheet,
  Plus,
  Loader2,
  ChevronRight,
  TrendingDown,
  Building,
  DollarSign
} from 'lucide-react'
import { notify } from '@/lib/notify'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: string
  date: string
  type: 'OPERATIONAL_EXPENSE' | 'SALARY'
  category: string
  payee: string
  method: string
  reference: string
  amount: number
}

interface ProfitLossStatement {
  id: string
  campusId: string | null
  periodLabel: string
  periodStart: string
  periodEnd: string
  totalIncome: number
  totalExpenses: number
  grossMargin: number
  profitPercentage: number
  superAdminAllocation: number
  superAdminMonthlyDraw: number
  reserveContribution: number
  remainingAmount: number
  createdAt: string
  reserveEntry?: {
    id: string
    cumulativeTotal: number
  } | null
}

// ─── Generate P&L Modal ────────────────────────────────────────────────────────

function GeneratePLModal({
  onClose,
  onSuccess,
  campuses,
  defaultCampusId,
  initial,
}: {
  onClose: () => void
  onSuccess: (statement?: ProfitLossStatement) => void
  campuses: { id: string; name: string }[]
  defaultCampusId?: string
  initial?: {
    periodLabel?: string
    periodStart?: string
    periodEnd?: string
    profitPercentage?: number
    notes?: string
    campusId?: string
  }
}) {
  const [periodLabel, setPeriodLabel] = useState(initial?.periodLabel ?? '')
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? '')
  const [profitPercentage, setProfitPercentage] = useState(String(initial?.profitPercentage ?? 20))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [campusId, setCampusId] = useState(initial?.campusId ?? defaultCampusId ?? 'all')

  const showCampusSelector = !defaultCampusId && campuses.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!periodLabel) {
      notify.error('Period label is required')
      return
    }
    if (!periodStart || !periodEnd) {
      notify.error('Period date range is required')
      return
    }
    setSubmitting(true)
    try {
      const createdStatement = await fetchApi<ProfitLossStatement>('/api/accountant/profit-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campusId: campusId !== 'all' ? campusId : undefined,
          periodLabel,
          periodStart: `${periodStart}T00:00:00.000Z`,
          periodEnd: `${periodEnd}T23:59:59.000Z`,
          profitPercentage: Number(profitPercentage),
          notes: notes || undefined,
        }),
      })
      notify.success('P&L Statement generated successfully')
      onSuccess(createdStatement)
    } catch (err: any) {
      notify.error(err?.message ?? 'Failed to generate P&L statement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
          <h2 className="font-black text-lg">Generate P&L Snapshot</h2>
          <button onClick={onClose} className="hover:opacity-70">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black uppercase text-gray-500 block mb-1">
              Period Label
            </label>
            <Input
              placeholder="e.g. June 2026"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              className="h-9 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">
                Start Date
              </label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="h-9 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">
                End Date
              </label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="h-9 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500 block mb-1">
              Campus scope
            </label>
            {showCampusSelector ? (
              <Select value={campusId} onValueChange={(v) => setCampusId(v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select campus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campuses</SelectItem>
                  {campuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Campus context is fixed to your assigned campus for this P&L snapshot.
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              Choose the campus whose expenses, payroll, and P&L allocation you want to snapshot. Only paid salary slips and approved expenses for that campus are included.
            </p>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500 block mb-1">
              SuperAdmin profit share %
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={profitPercentage}
              onChange={(e) => setProfitPercentage(e.target.value)}
              className="h-9 text-sm"
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">
              This percentage is the total SuperAdmin share from gross margin. The system splits it into 75% current draw and 25% reserve contribution.
            </p>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500 block mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add optional notes for this period..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Generate
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── P&L Card Component ────────────────────────────────────────────────────────

function PLCard({ statement, onRecreate }: { statement: ProfitLossStatement; onRecreate?: (init: any) => void }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-teal-50 rounded-xl shrink-0">
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-gray-900 text-sm">{statement.periodLabel}</p>
            <p className="text-[11px] text-gray-400">
              {new Date(statement.periodStart).toLocaleDateString()} —{' '}
              {new Date(statement.periodEnd).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge
            className={`text-xs font-bold border ${
              statement.grossMargin >= 0
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-red-100 text-red-700 border-red-200'
            }`}
          >
            {statement.grossMargin >= 0 ? 'Surplus' : 'Deficit'}
          </Badge>
          <span className="font-black text-slate-900 text-sm">
            {formatCurrency(statement.grossMargin)}
          </span>
          {open ? (
            <ChevronRight className="w-4 h-4 text-gray-400 rotate-90 transition-transform" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 transition-transform" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Total Income</p>
                  <p className="font-black text-emerald-700">{formatCurrency(statement.totalIncome)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Total Expenses</p>
                  <p className="font-black text-red-600">{formatCurrency(statement.totalExpenses)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Gross Margin</p>
                  <p className="font-black text-slate-900">{formatCurrency(statement.grossMargin)}</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-3">
                  <p className="text-[10px] text-teal-600 uppercase font-bold mb-0.5">Reserve Fund Total</p>
                  <p className="font-black text-teal-800">
                    {statement.reserveEntry
                      ? formatCurrency(statement.reserveEntry.cumulativeTotal)
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Profit Allocations */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-black text-gray-500 uppercase mb-2">
                  Distributions ({statement.profitPercentage}% Profit Share)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg p-2.5">
                    <span className="text-xs text-gray-600">SuperAdmin Allocation</span>
                    <span className="font-black text-slate-700">
                      {formatCurrency(statement.superAdminAllocation)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg p-2.5">
                    <span className="text-xs text-gray-600">SuperAdmin Monthly Draw (15%)</span>
                    <span className="font-black text-blue-700">
                      {formatCurrency(statement.superAdminMonthlyDraw)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-teal-50/50 rounded-lg p-2.5">
                    <span className="text-xs text-teal-700">Reserve Contribution (5%)</span>
                    <span className="font-black text-teal-700">
                      {formatCurrency(statement.reserveContribution)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-gray-100 pt-3 text-xs text-gray-400">
                <span>Remaining Campus Funds: {formatCurrency(statement.remainingAmount)}</span>
                <span>Generated on {formatDate(statement.createdAt)}</span>
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <Button
                  variant="ghost"
                  size="sm"
                      onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm('Delete this P&L snapshot? This action cannot be undone.')) return
                    try {
                      const res = await fetchApi(`/api/accountant/profit-loss/${statement.id}`, { method: 'DELETE' })
                      notify.success('Snapshot deleted')
                      qc.invalidateQueries({ queryKey: ['profit-loss-statements'] })
                      qc.invalidateQueries({ queryKey: ['profit-loss-latest', statement.campusId ?? ''] })
                    } catch (err) {
                      notify.error('Failed to delete snapshot')
                    }
                  }}
                >
                  Delete
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm('Regenerate this P&L snapshot now? This will replace the existing snapshot.')) return
                    try {
                      await fetchApi(`/api/accountant/profit-loss/${statement.id}/regenerate`, { method: 'POST' })
                      notify.success('Snapshot regenerated')
                      qc.invalidateQueries({ queryKey: ['profit-loss-statements'] })
                      qc.invalidateQueries({ queryKey: ['profit-loss-latest', statement.campusId ?? ''] })
                    } catch (err) {
                      notify.error('Failed to regenerate snapshot')
                    }
                  }}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Reports Dashboard Page ─────────────────────────────────────────────

export default function AccountantReportsPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role ?? ''
  const canAccess = ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(role)

  const [activeTab, setActiveTab] = useState<'ledger' | 'pl'>('pl')
  const [showPLModal, setShowPLModal] = useState(false)
  const [plInitial, setPlInitial] = useState<any | null>(null)
  const [createdSnapshot, setCreatedSnapshot] = useState<ProfitLossStatement | null>(null)
  const qc = useQueryClient()

  // Ledger Filter State
  const [ledgerStart, setLedgerStart] = useState('')
  const [ledgerEnd, setLedgerEnd] = useState('')
  const [ledgerMethod, setLedgerMethod] = useState('')

  // PL Filter State
  const [plYear, setPlYear] = useState('')
  const [plCampusId, setPlCampusId] = useState('all')
  const [plPage, setPlPage] = useState(1)

  const userCampusId = session?.user?.campusId ?? ''
  const { data: campusData } = useQuery({
    queryKey: ['accounting-campuses'],
    queryFn: () => fetchPaginatedApi<{ id: string; name: string }>('/api/campuses?limit=100'),
    enabled: canAccess && !userCampusId,
  })
  const campuses = campusData?.data ?? []

  // 1. Fetch Unified Ledger Entries
  const ledgerParams = new URLSearchParams()
  if (ledgerStart) ledgerParams.set('startDate', ledgerStart)
  if (ledgerEnd) ledgerParams.set('endDate', ledgerEnd)
  if (ledgerMethod) ledgerParams.set('paymentSource', ledgerMethod)

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['unified-ledger', ledgerStart, ledgerEnd, ledgerMethod],
    queryFn: () => fetchApi<LedgerEntry[]>(`/api/accountant/reports/expense-ledger?${ledgerParams}`),
    enabled: canAccess && activeTab === 'ledger',
  })

  const ledgerEntries = ledgerData ?? []

  // 2. Fetch Profit & Loss Snapshots
  const plParams = new URLSearchParams({ limit: '20', page: String(plPage) })
  if (plYear) plParams.set('year', plYear)
  if (plCampusId !== 'all') plParams.set('campusId', plCampusId)

  const { data: plData, isLoading: plLoading } = useQuery({
    queryKey: ['profit-loss-statements', plYear, plCampusId, plPage],
    queryFn: () =>
      fetchPaginatedApi<ProfitLossStatement>(`/api/accountant/profit-loss?${plParams}`),
    enabled: canAccess && activeTab === 'pl',
  })

  const plStatements = plData?.data ?? []
  const latestStatement = plStatements[0]
  const plPagination = plData?.pagination

  // 2b. Fetch latest snapshot independently so the top "Latest Snapshot" panel updates immediately
  const latestParams = new URLSearchParams({ limit: '1' })
  // pass campusId when user is scoped to one to avoid unnecessary server-side resolution
  if (userCampusId) latestParams.set('campusId', userCampusId)

  const { data: latestData } = useQuery({
    queryKey: ['profit-loss-latest', userCampusId],
    queryFn: () => fetchPaginatedApi<ProfitLossStatement>(`/api/accountant/profit-loss?${latestParams}`),
    enabled: canAccess,
    staleTime: 1000 * 30,
  })

  const latestSnapshot = latestData?.data?.[0] ?? latestStatement

  const handleExcelExport = () => {
    const downloadParams = new URLSearchParams(ledgerParams)
    downloadParams.set('export', 'excel')
    window.open(`/api/accountant/reports/expense-ledger?${downloadParams.toString()}`, '_blank')
    notify.success('Unified ledger download started')
  }

  const handlePLExport = () => {
    const downloadParams = new URLSearchParams()
    downloadParams.set('export', 'excel')
    if (plYear) downloadParams.set('year', plYear)
    if (plCampusId && plCampusId !== 'all') downloadParams.set('campusId', plCampusId)
    window.open(`/api/accountant/profit-loss?${downloadParams.toString()}`, '_blank')
    notify.success('P&L export started')
  }

  const handlePLSuccess = (statement?: ProfitLossStatement) => {
    setShowPLModal(false)
    setActiveTab('pl')
    setPlPage(1)
    setPlYear('')
    setPlCampusId(userCampusId || 'all')
    setCreatedSnapshot(statement ?? null)
    qc.invalidateQueries({ queryKey: ['profit-loss-statements'] })
    qc.invalidateQueries({ queryKey: ['profit-loss-statements', plYear, plCampusId, 1] })
    qc.invalidateQueries({ queryKey: ['profit-loss-latest', userCampusId] })
  }

  if (status === 'loading') return null
  if (!canAccess) {
    return <AccessDenied title="Reports Denied" message="Only finance personnel can access reports." />
  }

  return (
    <div className="min-h-screen bg-slate-50/40 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-800 text-white px-4 sm:px-6 lg:px-8 pt-18 pb-40 relative overflow-hidden min-h-[320px] sm:min-h-[380px]">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div>
            <p className="text-teal-200 text-xs font-bold uppercase tracking-widest mb-1">
              Accountant Workspace
            </p>
            <h1 className="text-2xl sm:text-3xl font-black leading-tight">Financial Reports</h1>
            <p className="text-teal-200 text-sm mt-1">
              Unified transaction ledgers and period P&L statements
            </p>
          </div>
          {activeTab === 'pl' && (
            <Button
              onClick={() => setShowPLModal(true)}
              className="bg-white text-teal-800 hover:bg-teal-50 font-black gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" /> Create P&L Snapshot
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 lg:-mt-20 space-y-6 z-20">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.95fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-teal-600 mb-2">
                  Profit & Loss Management
                </p>
                <h2 className="text-2xl font-black text-slate-900 mb-2">
                  Create audited P&L snapshots and track reserve fund allocations
                </h2>
                <p className="text-sm text-slate-500 max-w-2xl">
                  The system aggregates live fee income, approved expenses, and paid payroll records for a selected period. Each generated P&L statement persists a reserve fund contribution automatically.
                </p>
                <p className="text-sm text-slate-500 max-w-2xl mt-3">
                  Campus expense collection and salary payouts are reconciled before P&L is calculated. This makes the snapshot a professional snapshot of net operational performance.
                </p>
                <p className="text-sm text-slate-500 max-w-2xl mt-3">
                  Expense collection is campus-aware: only approved operational expenses and paid salary slips for the chosen campus and date range are included in the snapshot.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  onClick={() => {
                    setActiveTab('pl')
                    setShowPLModal(true)
                  }}
                  className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white gap-2 h-11"
                >
                  <Plus className="w-4 h-4" /> Create P&L Snapshot
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePLExport}
                  className="w-full sm:w-auto gap-2 border-teal-200 text-teal-700 h-11"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export P&L
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400 mb-3">
              Latest Snapshot
            </p>
            {createdSnapshot && (
              <div className="rounded-3xl border border-teal-200 bg-teal-50 p-4 mb-4">
                <p className="text-xs uppercase tracking-[0.18em] text-teal-700">Recently created snapshot</p>
                <p className="mt-1 text-lg font-black text-slate-900">{createdSnapshot.periodLabel}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                  <div className="rounded-2xl bg-white p-3 border border-teal-100">
                    <p className="text-[10px] uppercase text-teal-500">Gross margin</p>
                    <p className="font-black text-slate-900">{formatCurrency(createdSnapshot.grossMargin)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3 border border-teal-100">
                    <p className="text-[10px] uppercase text-teal-500">Reserve contribution</p>
                    <p className="font-black text-teal-700">{formatCurrency(createdSnapshot.reserveContribution)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3 border border-teal-100">
                    <p className="text-[10px] uppercase text-teal-500">Remaining amount</p>
                    <p className="font-black text-slate-900">{formatCurrency(createdSnapshot.remainingAmount)}</p>
                  </div>
                </div>
              </div>
            )}
            {latestSnapshot ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-white p-4 border border-slate-200">
                  <p className="text-sm text-slate-500">Period</p>
                  <p className="font-black text-slate-900">{latestSnapshot.periodLabel}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-white p-4 border border-slate-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Gross margin</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{formatCurrency(latestSnapshot.grossMargin)}</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4 border border-slate-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Reserve contribution</p>
                    <p className="mt-2 text-xl font-black text-teal-700">{formatCurrency(latestSnapshot.reserveContribution)}</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4 border border-slate-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">SuperAdmin allocation</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{formatCurrency(latestSnapshot.superAdminAllocation)}</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4 border border-slate-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Remaining amount</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{formatCurrency(latestSnapshot.remainingAmount)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-white p-6 border border-slate-200 text-sm text-slate-500">
                No P&L snapshot has been generated yet. Create one to begin tracking profit, reserve, and allocation performance for your campus.
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-white p-2 rounded-2xl shadow-sm gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`flex-1 sm:flex-initial px-4 py-2 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'ledger'
                ? 'bg-teal-50 text-teal-700'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Receipt className="w-4 h-4" /> Unified Ledger
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pl')}
            className={`flex-1 sm:flex-initial px-4 py-2 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'pl'
                ? 'bg-teal-50 text-teal-700'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" /> P&L Statements
          </button>
        </div>

        {/* Tab Contents: 1. Ledger */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            {/* Filter controls */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs font-black uppercase text-gray-400">Filters</span>
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <Calendar className="w-4 h-4 text-gray-400" />
                <Input
                  type="date"
                  value={ledgerStart}
                  onChange={(e) => setLedgerStart(e.target.value)}
                  className="border-0 p-0 h-7 text-xs w-28 focus-visible:ring-0"
                />
              </div>
              <span className="text-gray-300">to</span>
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <Calendar className="w-4 h-4 text-gray-400" />
                <Input
                  type="date"
                  value={ledgerEnd}
                  onChange={(e) => setLedgerEnd(e.target.value)}
                  className="border-0 p-0 h-7 text-xs w-28 focus-visible:ring-0"
                />
              </div>

              <select
                value={ledgerMethod}
                onChange={(e) => setLedgerMethod(e.target.value)}
                className="h-9 border border-gray-200 rounded-lg px-2"
              >
                <option value="">All payment sources</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>

              {(ledgerStart || ledgerEnd || ledgerMethod) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLedgerStart('')
                    setLedgerEnd('')
                    setLedgerMethod('')
                  }}
                  className="text-gray-400 hover:text-gray-600 gap-1 h-8"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleExcelExport}
                className="ml-auto border-teal-200 text-teal-700 hover:bg-teal-50 gap-1.5 h-9"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Excel
              </Button>
            </div>

            {/* Ledger Results */}
            {ledgerLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
                <Receipt className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="font-black text-gray-700">No transactions listed</p>
                <p className="text-sm text-gray-400 mt-1">
                  Adjust date boundaries or records filter settings.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase font-black tracking-wider text-gray-400">
                        <th className="px-5 py-3.5">Date</th>
                        <th className="px-5 py-3.5">Type</th>
                        <th className="px-5 py-3.5">Category</th>
                        <th className="px-5 py-3.5">Payee / Title</th>
                        <th className="px-5 py-3.5">Method</th>
                        <th className="px-5 py-3.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 text-gray-500">
                            {new Date(entry.date).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3">
                            <Badge
                              className={`text-[10px] font-bold border ${
                                entry.type === 'SALARY'
                                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}
                            >
                              {entry.type === 'SALARY' ? 'Salary' : 'Expense'}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-gray-700 font-medium">
                            {entry.category}
                          </td>
                          <td className="px-5 py-3 text-slate-900 font-bold">
                            {entry.payee}
                          </td>
                          <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                            {entry.method} {entry.reference && `(${entry.reference})`}
                          </td>
                          <td className="px-5 py-3 text-right font-black text-slate-900">
                            {formatCurrency(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Contents: 2. P&L Snapshots */}
        {activeTab === 'pl' && (
          <div className="space-y-4">
            {/* Filter Year and Campus */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm grid gap-3 lg:grid-cols-[auto_1fr_auto] items-center text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-black uppercase text-gray-400">Filter</span>
                <Input
                  type="number"
                  placeholder="Year"
                  value={plYear}
                  onChange={(e) => {
                    setPlYear(e.target.value)
                    setPlPage(1)
                  }}
                  className="w-28 h-9 text-sm"
                />
                {(!userCampusId || role === 'SUPER_ADMIN') && (
                  <Select value={plCampusId} onValueChange={(value) => {
                    setPlCampusId(value)
                    setPlPage(1)
                  }}>
                    <SelectTrigger className="h-9 w-44 text-sm">
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All campuses</SelectItem>
                      {campuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                {plYear ? `Filtered by ${plYear}` : 'Showing latest financial snapshots'}
                {plCampusId && `· Campus selected`}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handlePLExport}
                  className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50 h-9"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export P&L
                </Button>
              </div>
            </div>

            {createdSnapshot && (
              <div className="bg-white border border-teal-200 rounded-3xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-teal-600 font-black mb-1">
                      Recently created snapshot
                    </p>
                    <p className="text-lg font-black text-slate-900">{createdSnapshot.periodLabel}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreatedSnapshot(null)}
                    className="text-teal-700"
                  >
                    Clear
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                  <div className="rounded-2xl bg-teal-50 p-3">
                    <p className="text-[10px] uppercase text-teal-700">Gross margin</p>
                    <p className="font-black text-slate-900">{formatCurrency(createdSnapshot.grossMargin)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3 border border-teal-100">
                    <p className="text-[10px] uppercase text-teal-700">Reserve contribution</p>
                    <p className="font-black text-teal-700">{formatCurrency(createdSnapshot.reserveContribution)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3 border border-teal-100">
                    <p className="text-[10px] uppercase text-teal-700">Remaining amount</p>
                    <p className="font-black text-slate-900">{formatCurrency(createdSnapshot.remainingAmount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* P&L Statements List */}
            {plLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
              </div>
            ) : plStatements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
                <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="font-black text-gray-700">No statements generated yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Click the button at the top to compile your first financial snapshot.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {plStatements.map((statement) => (
                  <PLCard
                    key={statement.id}
                    statement={statement}
                    onRecreate={(init) => {
                      setPlInitial(init)
                      setShowPLModal(true)
                    }}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {plPagination && plPagination.totalPages > 1 && (
              <div className="flex justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={plPage <= 1}
                  onClick={() => setPlPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm font-bold text-gray-500 flex items-center px-2">
                  Page {plPage} / {plPagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={plPage >= plPagination.totalPages}
                  onClick={() => setPlPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {showPLModal && (
        <GeneratePLModal
          onClose={() => { setShowPLModal(false); setPlInitial(null) }}
          onSuccess={handlePLSuccess}
          campuses={campuses}
          defaultCampusId={userCampusId || undefined}
          initial={plInitial ?? undefined}
        />
      )}
    </div>
  )
}
