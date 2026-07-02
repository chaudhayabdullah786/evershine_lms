'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notify } from '@/lib/notify'
import { Search, Plus, Trash2, Download, CreditCard, AlertTriangle, CheckCircle2, Loader2, Eye, FileCheck, X, ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface StudentResult {
  id: string; registrationNumber: string; firstName: string; lastName: string
  fatherName: string; class?: { name: string } | null; feeStatus: string; dueAmount: string | number
}
interface FeeItem { description: string; amount: string }
interface CampusOption { id: string; name: string }
interface ClassOption { id: string; grade: number; section: string; campus?: { name: string } }
interface ReportFiltersProps {
  campuses: CampusOption[]
  classes: ClassOption[]
  selectedCampusId: string
  selectedClassId: string
  setSelectedCampusId: (value: string) => void
  setSelectedClassId: (value: string) => void
  canSelectCampus: boolean
}

const YEAR = new Date().getFullYear()
const AY   = `${YEAR - 1}-${YEAR}`
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const THIS_MONTH = `${MONTHS[new Date().getMonth()]} ${YEAR}`

async function downloadExcel(url: string, filename: string) {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); URL.revokeObjectURL(a.href)
}

export default function AccountantFeesPage() {
  const { data: session, status } = useSession()
  const role = (session?.user?.role as string) || ''
  const userCampusId = (session?.user as any)?.campusId || ''
  const canSelectCampus = !userCampusId || role === 'SUPER_ADMIN' || role === 'ADMIN'
  const [selectedCampusId, setSelectedCampusId] = useState<string>(userCampusId)
  const [selectedClassId, setSelectedClassId] = useState<string>('')

  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchPaginatedApi<CampusOption>('/api/campuses?limit=100'),
    enabled: !!session,
    staleTime: 60_000,
  })
  const campuses = campusesData?.data ?? []

  const classQuery = selectedCampusId ? `/api/classes?campusId=${selectedCampusId}&limit=200` : '/api/classes?limit=200'
  const { data: classesData, error: classesError } = useQuery({
    queryKey: ['accountant-fees-classes', selectedCampusId],
    queryFn: () => fetchApi<ClassOption[]>(classQuery),
    enabled: !!session,
    staleTime: 60_000,
  })
  const classes = classesData ?? []

  useEffect(() => {
    if (!classesError) return
    console.error('Failed to load classes for fees page', classesError)
    notify.error('Unable to load classes. Please check permissions or try again.')
  }, [classesError])

  useEffect(() => {
    if (userCampusId) setSelectedCampusId(userCampusId)
  }, [userCampusId])

  if (status === 'loading') return null
  if (!['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(role)) {
    return <AccessDenied title="Fee Collection Access" message="Only finance staff can access this workspace." />
  }
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Finance</p>
        <h1 className="text-2xl font-black text-slate-900">Fee Collection Hub</h1>
        <p className="text-sm text-slate-500">Issue invoices, track defaulters, and export payment reports.</p>
      </div>
      <Card className="border-teal-100 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Fee collection steps</CardTitle>
          <CardDescription>Complete the flow in order so challans, proof review, and exports stay aligned.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            ['1', 'Search student', 'Find the active student by name, registration number, roll number, or B-Form/CNIC.'],
            ['2', 'Issue challan', 'Select month, academic year, due date, and fee line items, then generate the invoice.'],
            ['3', 'Verify proof', 'Review uploaded payment proof and approve full or partial received amount.'],
            ['4', 'Export reports', 'Download defaulters and paid-fee lists for finance records.'],
          ].map(([step, title, body]) => (
            <div key={step} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-xs font-black text-white">{step}</span>
              <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="invoice" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoice" className="gap-2"><CreditCard className="h-4 w-4" />Issue Invoice</TabsTrigger>
          <TabsTrigger value="defaulters" className="gap-2"><AlertTriangle className="h-4 w-4" />Defaulters</TabsTrigger>
          <TabsTrigger value="paid" className="gap-2"><CheckCircle2 className="h-4 w-4" />Paid Fees</TabsTrigger>
          <TabsTrigger value="proofs" className="gap-2"><FileCheck className="h-4 w-4" />Payment Proofs</TabsTrigger>
        </TabsList>
        <TabsContent value="invoice"><IssueInvoiceTab /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab
          campuses={campuses}
          classes={classes}
          selectedCampusId={selectedCampusId}
          selectedClassId={selectedClassId}
          setSelectedCampusId={setSelectedCampusId}
          setSelectedClassId={setSelectedClassId}
          canSelectCampus={canSelectCampus}
        /></TabsContent>
        <TabsContent value="proofs"><PaymentProofsTab /></TabsContent>
        <TabsContent value="paid"><PaidFeesTab
          campuses={campuses}
          classes={classes}
          selectedCampusId={selectedCampusId}
          selectedClassId={selectedClassId}
          setSelectedCampusId={setSelectedCampusId}
          setSelectedClassId={setSelectedClassId}
          canSelectCampus={canSelectCampus}
        /></TabsContent>
      </Tabs>
    </div>
  )
}

function IssueInvoiceTab() {
  const queryClient = useQueryClient()
  const [query, setQuery]     = useState('')
  const [student, setStudent] = useState<StudentResult | null>(null)
  const [month, setMonth]     = useState(THIS_MONTH)
  const [ay, setAy]           = useState(AY)
  const [dueDate, setDueDate] = useState('')
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes]     = useState('')
  const [items, setItems]     = useState<FeeItem[]>([{ description: 'Tuition Fee', amount: '' }])

  const { data: sData, isFetching } = useQuery({
    queryKey: ['fee-student-search', query],
    queryFn: () => fetchPaginatedApi<StudentResult>(`/api/students?search=${encodeURIComponent(query)}&limit=8`),
    enabled: query.length >= 2,
    staleTime: 10_000,
  })
  const results = useMemo(() => sData?.data ?? [], [sData?.data])

  const total = useMemo(() => {
    const sum = items.reduce((a, it) => a + (parseFloat(it.amount) || 0), 0)
    return Math.max(0, sum - (parseFloat(discount) || 0))
  }, [items, discount])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('Select a student first')
      if (!dueDate) throw new Error('Set a due date')
      const valid = items.filter(it => it.description && parseFloat(it.amount) > 0)
      if (!valid.length) throw new Error('Add at least one item with an amount')
      await fetchApi('/api/accountant/fees/invoices', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id, month, academicYear: ay,
          dueDate: new Date(dueDate).toISOString(),
          items: valid.map(it => ({ description: it.description, amount: parseFloat(it.amount) })),
          discount: parseFloat(discount) || 0, notes: notes || undefined,
        }),
      })
    },
    onSuccess: () => {
      notify.success('Invoice issued', { description: `Challan generated for ${student?.firstName} ${student?.lastName}` })
      queryClient.invalidateQueries({ queryKey: ['accountant-fees'] })
      setStudent(null); setQuery(''); setItems([{ description: 'Tuition Fee', amount: '' }])
      setDiscount('0'); setNotes(''); setDueDate('')
    },
    onError: (e: unknown) => notify.error('Invoice failed', { description: e instanceof Error ? e.message : 'Unknown error' }),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Select Student</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input id="student-search" className="pl-9" placeholder="Name or reg. number…"
                value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            {isFetching && <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Searching…</p>}
            {query.length >= 2 && !isFetching && results.length === 0 && !student && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No active student found. Search by name, registration number, roll number, or B-Form/CNIC.
              </p>
            )}
            {results.length > 0 && !student && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y">
                {results.map(s => (
                  <button key={s.id} onClick={() => { setStudent(s); setQuery('') }}
                    className="w-full text-left p-3 hover:bg-teal-50 transition-colors">
                    <p className="font-semibold text-sm">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-slate-500">{s.registrationNumber} · {s.class?.name ?? 'No class'} · Due: <span className="text-red-600 font-semibold">{formatCurrency(s.dueAmount)}</span></p>
                  </button>
                ))}
              </div>
            )}
            {student && (
              <div className="rounded-xl border-2 border-teal-200 bg-teal-50 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-slate-900">{student.firstName} {student.lastName}</p>
                    <p className="text-xs text-slate-600">{student.registrationNumber} · {student.class?.name ?? 'No class'}</p>
                    <p className="text-xs text-slate-600">Father: {student.fatherName}</p>
                    <p className="text-xs text-red-600 font-semibold">Outstanding: {formatCurrency(student.dueAmount)}</p>
                  </div>
                  <button onClick={() => setStudent(null)} className="text-xs text-slate-400 hover:text-red-500">Change</button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">2. Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="inv-month">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="inv-month"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={`${m} ${YEAR}`}>{m} {YEAR}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-ay">Academic Year</Label>
              <Input id="inv-ay" value={ay} onChange={e => setAy(e.target.value)} placeholder="2025-2026" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-due">Due Date</Label>
              <Input id="inv-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-disc">Discount (PKR)</Label>
              <Input id="inv-disc" type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea id="inv-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional remarks…" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Fee Line Items</CardTitle>
          <CardDescription>Each charge appears separately on the student's challan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, i) => (
            <div key={i} className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`desc-${i}`}>Description</Label>
                <Input id={`desc-${i}`} value={item.description}
                  onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  placeholder="Tuition Fee / Computer Lab…" />
              </div>
              <div className="w-36 space-y-1">
                <Label htmlFor={`amt-${i}`}>Amount (PKR)</Label>
                <Input id={`amt-${i}`} type="number" min="0" step="0.01" value={item.amount}
                  onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  placeholder="0" />
              </div>
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                  className="text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems(p => [...p, { description: '', amount: '' }])}
            className="gap-2 border-dashed border-teal-300 text-teal-700 hover:bg-teal-50">
            <Plus className="h-4 w-4" /> Add line item
          </Button>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            {items.filter(it => it.description && parseFloat(it.amount) > 0).map((it, i) => (
              <div key={i} className="flex justify-between text-sm text-slate-600">
                <span>{it.description}</span><span>{formatCurrency(parseFloat(it.amount))}</span>
              </div>
            ))}
            {parseFloat(discount) > 0 && (
              <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>−{formatCurrency(parseFloat(discount))}</span></div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-slate-900">
              <span>Total Payable</span><span>{formatCurrency(total)}</span>
            </div>
          </div>
          <Button id="issue-invoice-btn" onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !student || !dueDate}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white">
            {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating challan…</> : 'Issue Invoice & Generate Challan'}
          </Button>
          {!student && <p className="text-xs text-slate-400 text-center">Select a student to enable invoice generation.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function DefaultersTab({ campuses, classes, selectedCampusId, selectedClassId, setSelectedCampusId, setSelectedClassId, canSelectCampus }: ReportFiltersProps) {
  const [ay, setAy]           = useState(AY)
  const [exporting, setExp]   = useState(false)
  const handleExport = useCallback(async () => {
    setExp(true)
    try {
      const params = new URLSearchParams({ academicYear: ay })
      if (selectedCampusId) params.set('campusId', selectedCampusId)
      if (selectedClassId) params.set('classId', selectedClassId)
      await downloadExcel(`/api/accountant/fees/export/defaulters?${params.toString()}`, `defaulters-${ay}.xlsx`)
      notify.success('Defaulter list downloaded')
    } catch {
      notify.error('Export failed')
    } finally {
      setExp(false)
    }
  }, [ay, selectedCampusId, selectedClassId])
  return (
    <Card>
      <CardHeader><CardTitle>Fee Defaulters Report</CardTitle>
        <CardDescription>Students with UNPAID or PARTIALLY_PAID status, sorted by highest outstanding amount.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          {canSelectCampus ? (
            <div className="space-y-1">
              <Label htmlFor="def-campus">Campus</Label>
              <Select value={selectedCampusId} onValueChange={(value) => { setSelectedCampusId(value === '__all__' ? '' : value); setSelectedClassId('') }}>
                <SelectTrigger id="def-campus" className="w-56"><SelectValue placeholder="All campuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All campuses</SelectItem>
                  {campuses.map((campus) => <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : selectedCampusId ? (
            <div className="space-y-1">
              <Label>Campus</Label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {campuses.find(c => c.id === selectedCampusId)?.name ?? 'Current campus'}
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="def-class">Class / Section</Label>
            <Select value={selectedClassId} onValueChange={(value) => setSelectedClassId(value === '__all__' ? '' : value)}>
              <SelectTrigger id="def-class" className="w-72"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {`${cls.grade} ${cls.section}${cls.campus?.name ? ` — ${cls.campus.name}` : ''}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="def-ay">Academic Year</Label>
            <Input id="def-ay" value={ay} onChange={e => setAy(e.target.value)} className="w-40" />
          </div>
          <Button id="export-defaulters-btn" onClick={handleExport} disabled={exporting} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Defaulter List (Excel)
          </Button>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 space-y-1">
          <p className="font-semibold text-sm">Report includes: </p>
          <p>Registration no. · Student & father name · Class · Contact number · Outstanding amount (PKR) · Last challan no.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function PaidFeesTab({ campuses, classes, selectedCampusId, selectedClassId, setSelectedCampusId, setSelectedClassId, canSelectCampus }: ReportFiltersProps) {
  const [month, setMonth]   = useState(THIS_MONTH)
  const [ay, setAy]         = useState(AY)
  const [exporting, setExp] = useState(false)
  const handleExport = useCallback(async () => {
    setExp(true)
    try {
      const params = new URLSearchParams({ month, academicYear: ay })
      if (selectedCampusId) params.set('campusId', selectedCampusId)
      if (selectedClassId) params.set('classId', selectedClassId)
      await downloadExcel(`/api/accountant/fees/export/paid?${params.toString()}`, `paid-${month.replace(' ', '-')}.xlsx`)
      notify.success('Paid fees list downloaded')
    } catch {
      notify.error('Export failed')
    } finally {
      setExp(false)
    }
  }, [month, ay, selectedCampusId, selectedClassId])
  return (
    <Card>
      <CardHeader><CardTitle>Paid Fees Report</CardTitle>
        <CardDescription>Export all PAID invoices for a given month and academic year.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          {canSelectCampus ? (
            <div className="space-y-1">
              <Label htmlFor="paid-campus">Campus</Label>
              <Select value={selectedCampusId} onValueChange={(value) => { setSelectedCampusId(value === '__all__' ? '' : value); setSelectedClassId('') }}>
                <SelectTrigger id="paid-campus" className="w-56"><SelectValue placeholder="All campuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All campuses</SelectItem>
                  {campuses.map((campus) => <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : selectedCampusId ? (
            <div className="space-y-1">
              <Label>Campus</Label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {campuses.find(c => c.id === selectedCampusId)?.name ?? 'Current campus'}
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="paid-class">Class / Section</Label>
            <Select value={selectedClassId} onValueChange={(value) => setSelectedClassId(value === '__all__' ? '' : value)}>
              <SelectTrigger id="paid-class" className="w-72"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {`${cls.grade} ${cls.section}${cls.campus?.name ? ` — ${cls.campus.name}` : ''}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="paid-month">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="paid-month" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={`${m} ${YEAR}`}>{m} {YEAR}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="paid-ay">Academic Year</Label>
            <Input id="paid-ay" value={ay} onChange={e => setAy(e.target.value)} className="w-40" />
          </div>
          <Button id="export-paid-btn" onClick={handleExport} disabled={exporting} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Paid List (Excel)
          </Button>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
          <p className="font-semibold text-sm">Report includes: </p>
          <p>Registration no. · Student & father name · Class · Month · Amount paid (PKR) · Payment date · Method · Challan no.</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Payment Proofs Queue ─────────────────────────────────────────────────────

interface PendingProofInvoice {
  id: string
  challanNumber: string
  month: string
  academicYear: string
  totalAmount: string | number
  paidAmount: string | number
  status: string
  proofUrl: string | null
  proofRemarks: string | null
  proofUploadedAt: string | null
  proofStatus: string | null
  dueDate: string
  student: {
    id: string
    firstName: string
    lastName: string
    registrationNumber: string
    fatherName: string
    campus: { name: string }
    class: { name: string; grade: number } | null
  }
}

function PaymentProofsTab() {
  const qc = useQueryClient()
  const [selectedProof, setSelectedProof] = useState<PendingProofInvoice | null>(null)
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [actionRemarks, setActionRemarks] = useState('')
  const [paidAmountStr, setPaidAmountStr] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const { data: proofs, isLoading } = useQuery({
    queryKey: ['accountant-pending-proofs'],
    queryFn: () => fetchApi<PendingProofInvoice[]>('/api/accountant/fees/pending-proofs'),
    refetchInterval: 30_000,
  })

  const actionMutation = useMutation({
    mutationFn: async ({ invoiceId, action, remarks, paidAmount }: {
      invoiceId: string; action: string; remarks?: string; paidAmount?: number
    }) =>
      fetchApi(`/api/accountant/fees/invoices/${invoiceId}/proof`, {
        method: 'PATCH',
        body: JSON.stringify({ action, remarks, paidAmount }),
      }),
    onSuccess: () => {
      notify.success(actionType === 'APPROVE' ? 'Payment approved!' : 'Payment rejected.')
      setSelectedProof(null)
      setActionRemarks('')
      setPaidAmountStr('')
      qc.invalidateQueries({ queryKey: ['accountant-pending-proofs'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const pendingList = proofs ?? []

  const handleAction = () => {
    if (!selectedProof) return
    if (actionType === 'REJECT' && !actionRemarks.trim()) {
      notify.error('Rejection reason is required')
      return
    }
    const paidNum = paidAmountStr ? parseFloat(paidAmountStr) : undefined
    actionMutation.mutate({
      invoiceId: selectedProof.id,
      action: actionType,
      remarks: actionRemarks.trim() || undefined,
      paidAmount: paidNum && paidNum > 0 ? paidNum : undefined,
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-amber-600" /> Payment Proofs Queue
          </CardTitle>
          <CardDescription>
            Review uploaded payment receipts. Approve with exact amount or reject with reason.
            {pendingList.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingList.length} pending</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading pending proofs...
            </div>
          ) : pendingList.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-300 mb-3" />
              <p className="font-semibold">All clear!</p>
              <p className="text-sm">No payment proofs awaiting verification.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pendingList.map((inv) => {
                const total = Number(inv.totalAmount)
                const paid = Number(inv.paidAmount)
                const remaining = total - paid
                return (
                  <div key={inv.id} className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-4 space-y-3">
                    {/* Student Info */}
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm text-slate-900">
                          {inv.student.firstName} {inv.student.lastName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {inv.student.registrationNumber} · {inv.student.class?.name ?? 'N/A'} · {inv.student.campus.name}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px]">
                        PENDING
                      </Badge>
                    </div>

                    {/* Financial Details */}
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <p className="text-slate-400 font-semibold">Challan</p>
                        <p className="font-mono font-bold text-slate-800 truncate">{inv.challanNumber}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <p className="text-slate-400 font-semibold">Total</p>
                        <p className="font-bold text-slate-800">{formatCurrency(total)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-red-100">
                        <p className="text-red-400 font-semibold">Due</p>
                        <p className="font-bold text-red-700">{formatCurrency(remaining)}</p>
                      </div>
                    </div>

                    {/* Proof Thumbnail */}
                    {inv.proofUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(inv.proofUrl)}
                        className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200 bg-white group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={inv.proofUrl}
                          alt="Payment proof"
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                        </div>
                      </button>
                    )}

                    {/* Student Remarks */}
                    {inv.proofRemarks && (
                      <div className="bg-white rounded-lg p-2 border border-slate-200 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Note:</span> {inv.proofRemarks}
                      </div>
                    )}

                    {/* Upload time */}
                    {inv.proofUploadedAt && (
                      <p className="text-[10px] text-slate-400">
                        Uploaded {new Date(inv.proofUploadedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1 text-xs"
                        onClick={() => {
                          setSelectedProof(inv)
                          setActionType('APPROVE')
                          setPaidAmountStr(String(remaining))
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50 gap-1 text-xs"
                        onClick={() => {
                          setSelectedProof(inv)
                          setActionType('REJECT')
                        }}
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="sm:max-w-3xl p-2">
          {lightboxUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightboxUrl} alt="Payment proof full view" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Approve / Reject Dialog */}
      <Dialog open={!!selectedProof} onOpenChange={(open) => { if (!open) setSelectedProof(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'APPROVE' ? (
                <><CheckCircle2 className="w-5 h-5 text-green-600" /> Approve Payment</>
              ) : (
                <><X className="w-5 h-5 text-red-600" /> Reject Proof</>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedProof && (
                <>
                  Challan: <span className="font-mono font-bold">{selectedProof.challanNumber}</span>
                  <br />
                  Student: <span className="font-bold">{selectedProof.student.firstName} {selectedProof.student.lastName}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {actionType === 'APPROVE' && selectedProof && (
              <div className="space-y-1.5">
                <Label>Verified Paid Amount (PKR)</Label>
                <Input
                  type="number"
                  placeholder={`Max: ${Number(selectedProof.totalAmount) - Number(selectedProof.paidAmount)}`}
                  value={paidAmountStr}
                  onChange={(e) => setPaidAmountStr(e.target.value)}
                  min={1}
                  max={Number(selectedProof.totalAmount) - Number(selectedProof.paidAmount)}
                />
                <p className="text-[11px] text-slate-500">
                  Leave as full amount for complete payment. Enter lesser amount for partial payment.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                Remarks {actionType === 'REJECT' && <span className="text-red-500">*</span>}
              </Label>
              <Textarea
                placeholder={actionType === 'REJECT' ? 'Reason for rejection (required)' : 'Optional notes...'}
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProof(null)} disabled={actionMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={actionMutation.isPending}
              className={actionType === 'APPROVE'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
              }
            >
              {actionMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing...</>
              ) : (
                actionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
