'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck,
  Calendar,
  X,
  Loader2,
  TrendingUp,
  Building,
  History,
  Coins
} from 'lucide-react'
import { motion } from 'framer-motion'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Campus {
  id: string
  name: string
  code: string
}

interface ReserveEntry {
  id: string
  profitLossId: string | null
  campusId: string | null
  contributionAmount: number
  cumulativeTotal: number
  periodLabel: string
  notes: string | null
  transactionDate: string
  profitLoss?: {
    periodLabel: string
    grossMargin: number
    superAdminAllocation: number
    superAdminMonthlyDraw: number
  } | null
}

interface ReserveResponse {
  entries: ReserveEntry[]
  currentBalance: number
  filteredBy: {
    campusId: string
    year: string
  }
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export default function ReserveFundPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role ?? ''
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const [campusId, setCampusId] = useState('')
  const [year, setYear] = useState('')
  const [page, setPage] = useState(1)

  // 1. Fetch campuses for dropdown selection
  const { data: campusesData } = useQuery({
    queryKey: ['admin-campuses-list'],
    queryFn: () => fetchApi<Campus[]>('/api/campuses'),
    enabled: isSuperAdmin,
  })
  const campuses = campusesData ?? []

  // 2. Fetch Reserve Fund Ledger entries
  const params = new URLSearchParams({ limit: '20', page: String(page) })
  if (campusId) params.set('campusId', campusId)
  if (year) params.set('year', year)

  const { data, isLoading } = useQuery({
    queryKey: ['reserve-fund-ledger', campusId, year, page],
    queryFn: () => fetchApi<ReserveResponse>(`/api/superadmin/reserve-fund?${params}`),
    enabled: isSuperAdmin,
  })

  const entries: ReserveEntry[] = data?.entries ?? []
  const balance = data?.currentBalance ?? 0
  const pagination = data?.pagination

  if (status === 'loading') return null
  if (!isSuperAdmin) {
    return (
      <AccessDenied
        title="Access Restricted"
        message="Only Super Administrators have permission to view the institutional reserve fund ledger."
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/40 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white px-4 sm:px-6 lg:px-8 pt-8 pb-16 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div>
            <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">
              Governance & Capital Reserve
            </p>
            <h1 className="text-2xl sm:text-3xl font-black leading-tight flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-indigo-400" /> Reserve Fund Ledger
            </h1>
            <p className="text-indigo-300 text-sm mt-1">
              Append-only institutional reserve allocation ledger (5% of P&L allocations)
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-6">
        {/* Balance Metric card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="shadow-sm border-indigo-100 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-indigo-500" /> Current Cumulative Reserve Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-indigo-950">{formatCurrency(balance)}</p>
              <p className="text-xs text-gray-400 mt-1">
                Aggregated from all campus allocations snapshot cycles.
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-indigo-100 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-500" /> Latest Allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black text-slate-800">
                {entries.length > 0 ? formatCurrency(entries[0].contributionAmount) : 'PKR 0'}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                {entries.length > 0 ? `Assigned for ${entries[0].periodLabel}` : 'No records yet.'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters bar */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-black uppercase text-gray-400">Filters</span>
          <select
            value={campusId}
            onChange={(e) => {
              setCampusId(e.target.value)
              setPage(1)
            }}
            className="h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white"
          >
            <option value="">All Campuses</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1 bg-white">
            <Calendar className="w-4 h-4 text-gray-400" />
            <Input
              type="number"
              placeholder="Year (e.g. 2026)"
              value={year}
              onChange={(e) => {
                setYear(e.target.value)
                setPage(1)
              }}
              className="border-0 p-0 h-7 text-xs w-28 focus-visible:ring-0"
            />
          </div>

          {(campusId || year) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCampusId('')
                setYear('')
                setPage(1)
              }}
              className="text-gray-400 hover:text-gray-600 gap-1 h-8"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Ledger Entries List */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="font-black text-gray-700">Reserve ledger is empty</p>
            <p className="text-sm text-gray-400 mt-1">
              Allocations will appear here as soon as accountants finalize P&L snapshot cycles.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase font-black tracking-wider text-gray-400">
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Period</th>
                    <th className="px-5 py-3.5">Contribution Amount</th>
                    <th className="px-5 py-3.5">Cumulative Total</th>
                    <th className="px-5 py-3.5">Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4 text-gray-500">
                        {new Date(entry.transactionDate).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-800">{entry.periodLabel}</span>
                      </td>
                      <td className="px-5 py-4 text-emerald-700 font-black">
                        + {formatCurrency(entry.contributionAmount)}
                      </td>
                      <td className="px-5 py-4 font-black text-indigo-900">
                        {formatCurrency(entry.cumulativeTotal)}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400 max-w-xs truncate">
                        {entry.notes || 'Routine reserve allocation snapshot'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm font-bold text-gray-500 flex items-center px-2">
              Page {page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
