'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { fetchPaginatedApi } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Banknote, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'

interface SalarySlip {
  id: string
  employeeName: string
  month: string
  salaryPeriodStart: string
  salaryPeriodEnd: string
  basicSalary: number
  overtimeAmount: number
  lunchDues: number
  totalAdditions: number
  totalDeductions: number
  netSalary: number
  paymentSource: string
  bankName: string | null
  accountNumber: string | null
  customFields: Array<{ label: string; value: number; isDeduction: boolean }> | null
  notes: string | null
  status: string
  designation: string | null
  createdAt: string
}

function SlipCard({ slip }: { slip: SalarySlip }) {
  const [open, setOpen] = useState(false)
  const pct = slip.totalAdditions > 0
    ? Math.round((slip.netSalary / slip.totalAdditions) * 100)
    : 100

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-indigo-50 rounded-xl shrink-0">
            <Banknote className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-gray-900 text-sm">{slip.month}</p>
            <p className="text-[11px] text-gray-400">
              {new Date(slip.salaryPeriodStart).toLocaleDateString('en-PK')} — {new Date(slip.salaryPeriodEnd).toLocaleDateString('en-PK')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge className={`text-xs font-bold border ${slip.status === 'ISSUED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {slip.status}
          </Badge>
          <span className="font-black text-indigo-900 text-sm">PKR {Number(slip.netSalary).toLocaleString()}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
              {/* Breakdown grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Basic Salary</p>
                  <p className="font-black text-gray-900">PKR {Number(slip.basicSalary).toLocaleString()}</p>
                </div>
                {Number(slip.overtimeAmount) > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Overtime</p>
                    <p className="font-black text-emerald-700">+ PKR {Number(slip.overtimeAmount).toLocaleString()}</p>
                  </div>
                )}
                {Number(slip.lunchDues) > 0 && (
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Lunch Dues</p>
                    <p className="font-black text-red-600">- PKR {Number(slip.lunchDues).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Custom fields */}
              {slip.customFields && slip.customFields.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Other Components</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slip.customFields.map((cf, i) => (
                      <div key={i} className="flex justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                        <span className="text-gray-600 font-bold">{cf.label}</span>
                        <span className={`font-black ${cf.isDeduction ? 'text-red-600' : 'text-emerald-700'}`}>
                          {cf.isDeduction ? '-' : '+'} PKR {Number(cf.value).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Net payable summary bar */}
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-4 text-white grid grid-cols-3 text-center gap-2">
                <div>
                  <p className="text-[10px] text-indigo-200 uppercase font-bold">Gross</p>
                  <p className="font-black text-sm">PKR {Number(slip.totalAdditions).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-200 uppercase font-bold">Deductions</p>
                  <p className="font-black text-sm text-red-300">- PKR {Number(slip.totalDeductions).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-200 uppercase font-bold">Net Payable</p>
                  <p className="font-black text-lg">PKR {Number(slip.netSalary).toLocaleString()}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Net / Gross Ratio</p>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{pct}% of gross retained after deductions</p>
              </div>

              {/* Payment meta */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
                <span className="font-bold">Payment via: <span className="font-black text-gray-700">{slip.paymentSource}</span></span>
                {slip.bankName && <span className="font-bold">Bank: <span className="font-black text-gray-700">{slip.bankName}</span></span>}
                {slip.accountNumber && <span className="font-bold">Account: <span className="font-black text-gray-700 font-mono">{slip.accountNumber}</span></span>}
                {slip.notes && <span className="italic">{slip.notes}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TeacherSalaryPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role ?? ''
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-my-salary-slips', page],
    queryFn: () => fetchPaginatedApi<SalarySlip>(`/api/accountant/salary-slips?limit=10&page=${page}`),
    enabled: status === 'authenticated',
  })

  const slips = data?.data ?? []
  const pagination = data?.pagination

  if (status === 'loading') return null

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="min-h-screen bg-slate-50/30 pb-16">
      {/* Header banner */}
      <motion.div variants={fadeUp(0.1)}
        className="bg-gradient-to-br from-indigo-700 via-blue-700 to-blue-800 text-white px-4 sm:px-6 lg:px-8 pt-8 pb-16 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="max-w-3xl mx-auto relative z-10">
          <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">My Account</p>
          <h1 className="text-2xl sm:text-3xl font-black">My Salary Slips</h1>
          <p className="text-blue-200 text-sm mt-1">View your monthly payroll records issued by the academy</p>
        </div>
      </motion.div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          </div>
        ) : slips.length === 0 ? (
          <motion.div variants={fadeUp(0.2)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <Banknote className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="font-black text-gray-700">No salary slips yet</p>
            <p className="text-sm text-gray-400 mt-1">Your payroll records will appear here once issued by the accountant.</p>
          </motion.div>
        ) : (
          <>
            {slips.map(slip => <SlipCard key={slip.id} slip={slip} />)}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm font-bold text-gray-500 flex items-center px-2">Page {page} / {pagination.totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
