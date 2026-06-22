'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Banknote, Plus, Search, X, Download, ChevronDown, ChevronUp, Loader2, FileText } from 'lucide-react'
import { notify } from '@/lib/notify'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalarySlip {
  id: string
  employeeId: string
  employeeName: string
  employeeRole: string
  employeeNumber: string | null
  designation: string | null
  month: string
  salaryPeriodStart: string
  salaryPeriodEnd: string
  basicSalary: number
  overtimeAmount: number
  lunchDues: number
  totalAdditions: number
  totalDeductions: number
  netSalary: number
  bankName: string | null
  accountNumber: string | null
  paymentSource: string
  customFields: Array<{ label: string; value: number; isDeduction: boolean }> | null
  notes: string | null
  status: string
  createdAt: string
}

interface CustomField {
  label: string
  value: number
  isDeduction: boolean
}

// ─── Issue Slip Form ──────────────────────────────────────────────────────────

function IssueSlipModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [search, setSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  const [basicSalary, setBasicSalary] = useState('')
  const [overtime, setOvertime] = useState('0')
  const [lunchDues, setLunchDues] = useState('0')
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.toLocaleString('default', { month: 'long' })} ${d.getFullYear()}`
  })
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1, 0)
    return d.toISOString().split('T')[0]
  })
  const [paymentSource, setPaymentSource] = useState<'Cash' | 'Bank Transfer' | 'Cheque'>('Cash')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [submitting, setSubmitting] = useState(false)

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['emp-search-salary', search],
    queryFn: () => fetchPaginatedApi<any>(`/api/teachers?limit=10&search=${encodeURIComponent(search)}`),
    enabled: search.length >= 2,
  })
  const employees = empData?.data ?? []

  const addCustomField = () => setCustomFields(f => [...f, { label: '', value: 0, isDeduction: false }])
  const removeCustomField = (i: number) => setCustomFields(f => f.filter((_, idx) => idx !== i))
  const updateCF = (i: number, key: keyof CustomField, val: any) =>
    setCustomFields(f => f.map((cf, idx) => idx === i ? { ...cf, [key]: val } : cf))

  const additions = Number(basicSalary || 0) + Number(overtime || 0) +
    customFields.filter(cf => !cf.isDeduction).reduce((s, cf) => s + Number(cf.value), 0)
  const deductions = Number(lunchDues || 0) +
    customFields.filter(cf => cf.isDeduction).reduce((s, cf) => s + Number(cf.value), 0)
  const net = additions - deductions

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployee) { notify.error('Select an employee first'); return }
    if (!basicSalary || Number(basicSalary) <= 0) { notify.error('Basic salary is required'); return }
    setSubmitting(true)
    try {
      await fetchApi('/api/accountant/salary-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee.userId ?? selectedEmployee.id,
          month, salaryPeriodStart: `${periodStart}T00:00:00.000Z`,
          salaryPeriodEnd: `${periodEnd}T23:59:59.000Z`,
          basicSalary: Number(basicSalary), overtimeAmount: Number(overtime),
          lunchDues: Number(lunchDues), paymentSource,
          bankName: bankName || null, accountNumber: accountNumber || null,
          notes: notes || undefined,
          customFields: customFields.length > 0 ? customFields : null,
        }),
      })
      notify.success('Salary slip issued successfully')
      onSuccess()
    } catch (err: any) {
      notify.error(err?.message ?? 'Failed to issue salary slip')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
          <h2 className="font-black text-lg">Issue Salary Slip</h2>
          <button onClick={onClose} className="hover:opacity-70"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Employee search */}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 block mb-1">Employee</label>
            {!selectedEmployee ? (
              <div className="space-y-2">
                <Input placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} className="h-9" />
                {empLoading && <p className="text-xs text-gray-400">Searching…</p>}
                {employees.length > 0 && (
                  <div className="border rounded-xl divide-y max-h-36 overflow-y-auto">
                    {employees.map((emp: any) => (
                      <button key={emp.id} type="button" onClick={() => { setSelectedEmployee(emp); setSearch('') }}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-gray-400">{emp.designation} · {emp.employeeId}</p>
                        </div>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{emp.employeeId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div>
                  <p className="font-black text-sm text-indigo-900">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
                  <p className="text-xs text-indigo-600">{selectedEmployee.designation} · {selectedEmployee.employeeId}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedEmployee(null)}>Change</Button>
              </div>
            )}
          </div>

          {/* Month & Period */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Month</label>
              <Input value={month} onChange={e => setMonth(e.target.value)} placeholder="June 2026" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Period Start</label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Period End</label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Salary components */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Basic Salary (PKR)*</label>
              <Input type="number" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} min={1} placeholder="0" className="h-9 text-sm" required />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Overtime (PKR)</label>
              <Input type="number" value={overtime} onChange={e => setOvertime(e.target.value)} min={0} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Lunch Dues (PKR)</label>
              <Input type="number" value={lunchDues} onChange={e => setLunchDues(e.target.value)} min={0} className="h-9 text-sm" />
            </div>
          </div>

          {/* Custom fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase text-gray-500">Additions / Deductions</label>
              <Button type="button" variant="outline" size="sm" onClick={addCustomField} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            {customFields.map((cf, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <Input placeholder="Label" value={cf.label} onChange={e => updateCF(i, 'label', e.target.value)} className="h-8 text-xs flex-1" />
                <Input type="number" placeholder="Amount" value={cf.value} onChange={e => updateCF(i, 'value', Number(e.target.value))} className="h-8 text-xs w-28" />
                <select value={cf.isDeduction ? 'deduction' : 'addition'}
                  onChange={e => updateCF(i, 'isDeduction', e.target.value === 'deduction')}
                  className="h-8 text-xs border rounded-md px-2">
                  <option value="addition">+ Addition</option>
                  <option value="deduction">- Deduction</option>
                </select>
                <button type="button" onClick={() => removeCustomField(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* Net summary */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4 grid grid-cols-3 text-center border border-indigo-100">
            <div><p className="text-xs text-gray-500 font-bold uppercase">Total Additions</p><p className="text-lg font-black text-emerald-700">PKR {additions.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-500 font-bold uppercase">Total Deductions</p><p className="text-lg font-black text-red-600">PKR {deductions.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-500 font-bold uppercase">Net Payable</p><p className={`text-xl font-black ${net < 0 ? 'text-red-600' : 'text-indigo-900'}`}>PKR {net.toLocaleString()}</p></div>
          </div>

          {/* Payment source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Payment Source</label>
              <select value={paymentSource} onChange={e => setPaymentSource(e.target.value as any)}
                className="w-full h-9 text-sm border border-gray-200 rounded-lg px-2">
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
              </select>
            </div>
            {paymentSource !== 'Cash' && (
              <div>
                <label className="text-xs font-black uppercase text-gray-500 block mb-1">Bank Name</label>
                <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HBL" className="h-9 text-sm" />
              </div>
            )}
          </div>
          {paymentSource !== 'Cash' && (
            <div>
              <label className="text-xs font-black uppercase text-gray-500 block mb-1">Account Number</label>
              <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="IBAN or account no." className="h-9 text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || net < 0} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Issue Slip
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Slip Row ─────────────────────────────────────────────────────────────────

function SlipRow({ slip }: { slip: SalarySlip }) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = slip.status === 'ISSUED'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={() => setExpanded(e => !e)}
        className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 gap-3 hover:bg-gray-50/50 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-indigo-50 rounded-xl shrink-0">
            <Banknote className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-gray-900 text-sm truncate">{slip.employeeName}</p>
            <p className="text-[11px] text-gray-400">{slip.designation ?? slip.employeeRole} · {slip.month}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge className={`text-xs font-bold border ${statusColor}`}>{slip.status}</Badge>
          <span className="text-sm font-black text-indigo-900">PKR {Number(slip.netSalary).toLocaleString()}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="px-5 pb-4 border-t border-gray-100 pt-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Basic Salary</p><p className="font-black">PKR {Number(slip.basicSalary).toLocaleString()}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Overtime</p><p className="font-black text-emerald-700">+ PKR {Number(slip.overtimeAmount).toLocaleString()}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Lunch Dues</p><p className="font-black text-red-600">- PKR {Number(slip.lunchDues).toLocaleString()}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Payment</p><p className="font-black">{slip.paymentSource}</p></div>
              </div>

              {slip.customFields && slip.customFields.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Additions / Deductions</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slip.customFields.map((cf, i) => (
                      <div key={i} className="flex justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-gray-500 font-bold">{cf.label}</span>
                        <span className={`font-black ${cf.isDeduction ? 'text-red-600' : 'text-emerald-700'}`}>
                          {cf.isDeduction ? '- ' : '+ '}PKR {Number(cf.value).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-400">
                  {slip.bankName && <span>{slip.bankName} · {slip.accountNumber}</span>}
                  {slip.notes && <span className="ml-3 italic">{slip.notes}</span>}
                </div>
                <Button variant="outline" size="sm" className="gap-2 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs h-8">
                  <FileText className="w-3.5 h-3.5" /> View PDF
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalarySlipsPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role ?? ''
  const canAccess = ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(role)

  const [showModal, setShowModal] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const params = new URLSearchParams({ limit: '20', page: String(page) })
  if (filterMonth) params.set('month', filterMonth)
  if (filterStatus) params.set('status', filterStatus)

  const { data, isLoading } = useQuery({
    queryKey: ['salary-slips', filterMonth, filterStatus, page],
    queryFn: () => fetchPaginatedApi<SalarySlip>(`/api/accountant/salary-slips?${params}`),
    enabled: canAccess,
  })

  const slips = data?.data ?? []
  const pagination = data?.pagination

  const totalNet = useMemo(() => slips.reduce((s, slip) => s + Number(slip.netSalary), 0), [slips])

  const onIssued = () => {
    setShowModal(false)
    qc.invalidateQueries({ queryKey: ['salary-slips'] })
  }

  if (status === 'loading') return null
  if (!canAccess) return <AccessDenied title="Payroll Access" message="Only finance staff can access salary slips." />

  return (
    <div className="min-h-screen bg-slate-50/40 pb-16">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-700 via-blue-700 to-blue-800 text-white px-4 sm:px-6 lg:px-8 pt-8 pb-16 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Accountant · Payroll</p>
            <h1 className="text-2xl sm:text-3xl font-black leading-tight">Salary Slips</h1>
            <p className="text-blue-200 text-sm mt-1">Issue, track and export staff payroll records</p>
          </div>
          <Button onClick={() => setShowModal(true)}
            className="bg-white text-indigo-700 hover:bg-indigo-50 font-black gap-2 shadow-lg">
            <Plus className="w-4 h-4" /> Issue New Slip
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-5">
        {/* Summary stat */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card className="shadow-sm">
            <CardContent className="pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Slips Listed</p>
              <p className="text-2xl font-black text-indigo-900">{pagination?.total ?? slips.length}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Net Payable (page)</p>
              <p className="text-2xl font-black text-indigo-900">PKR {totalNet.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm hidden sm:block">
            <CardContent className="pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Current Filter</p>
              <p className="text-sm font-black text-gray-700">{filterMonth || 'All months'} · {filterStatus || 'All statuses'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <p className="text-xs font-black uppercase text-gray-400 mr-1">Filter</p>
          <Input placeholder="Month (e.g. June 2026)" value={filterMonth}
            onChange={e => { setFilterMonth(e.target.value); setPage(1) }}
            className="h-9 text-sm w-48" />
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
            className="h-9 text-sm border border-gray-200 rounded-lg px-3">
            <option value="">All Statuses</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          {(filterMonth || filterStatus) && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-gray-500"
              onClick={() => { setFilterMonth(''); setFilterStatus(''); setPage(1) }}>
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Slip list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          </div>
        ) : slips.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <Banknote className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="font-black text-gray-700">No salary slips found</p>
            <p className="text-sm text-gray-400 mt-1">Issue a new slip using the button above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slips.map(slip => <SlipRow key={slip.id} slip={slip} />)}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-sm font-bold text-gray-500 flex items-center px-2">Page {page} / {pagination.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </div>

      {showModal && <IssueSlipModal onClose={() => setShowModal(false)} onSuccess={onIssued} />}
    </div>
  )
}
