'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Search, DollarSign, ChevronLeft, ChevronRight, X, CreditCard, FileText, UploadCloud, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { AccessDenied } from '@/components/AccessDenied'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'
import { PaymentProofUploadModal } from '@/components/fees/PaymentProofUploadModal'

interface FeeInvoice {
  id: string
  challanNumber: string
  month: string
  academicYear: string
  totalAmount: string | number
  paidAmount: string | number
  status: string
  proofStatus: string | null
  dueDate: string
  student: {
    id: string
    firstName: string
    lastName: string
    registrationNumber: string
  }
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700 border-green-200',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  ISSUED: 'bg-blue-100 text-blue-700 border-blue-200',
  OVERDUE: 'bg-red-100 text-red-700 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200',
}

interface CollectPaymentModalProps {
  invoice: FeeInvoice | null
  onClose: () => void
}

function CollectPaymentModal({ invoice, onClose }: CollectPaymentModalProps) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [transactionId, setTransactionId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)

  if (!invoice) return null

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payAmount = parseFloat(amount)
    if (!payAmount || payAmount <= 0) {
      notify.error('Enter a valid payment amount')
      return
    }
    if (payAmount > remaining) {
      notify.error(`Amount exceeds remaining balance of Rs ${remaining.toLocaleString()}`)
      return
    }

    setLoading(true)
    try {
      await fetchApi(`/api/fees/${invoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: payAmount,
          paymentMethod: method,
          transactionId: transactionId || undefined,
          remarks: remarks || undefined,
        }),
      })
      notify.success('Payment recorded successfully')
      queryClient.invalidateQueries({ queryKey: ['fees'] })
      onClose()
    } catch (err: any) {
      notify.error('Failed to record payment', { description: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!invoice} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-600" />
            Collect Payment
          </DialogTitle>
          <DialogDescription>
            Challan: <span className="font-mono font-medium">{invoice.challanNumber}</span>
            <br />
            Student: <span className="font-medium">{invoice.student.firstName} {invoice.student.lastName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3">
              <p className="text-xs text-blue-600 font-medium">Total Due</p>
              <p className="text-lg font-bold text-blue-800">Rs {Number(invoice.totalAmount).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-3">
              <p className="text-xs text-green-600 font-medium">Remaining</p>
              <p className="text-lg font-bold text-green-800">Rs {remaining.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Payment Amount (Rs)</Label>
            <Input
              type="number"
              placeholder={`Max: ${remaining}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={remaining}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Online">Online</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {method !== 'Cash' && (
            <div className="space-y-1.5">
              <Label>Transaction / Reference ID</Label>
              <Input
                placeholder="Bank transaction reference"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Remarks (optional)</Label>
            <Input
              placeholder="Any notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
              {loading ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function FeesManagementPage() {
  const { data: session, status } = useSession()
  const role = (session?.user?.role as string) || ''
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(role)
  const ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STUDENT', 'PARENT', 'GUARDIAN']
  const canViewFees = ALLOWED_ROLES.includes(role)

  const searchParams = useSearchParams()
  const filterStudentId = searchParams.get('studentId') ?? ''

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [proofStatusFilter, setProofStatusFilter] = useState('')
  const [collectInvoice, setCollectInvoice] = useState<FeeInvoice | null>(null)
  const [uploadInvoice, setUploadInvoice] = useState<FeeInvoice | null>(null)
  const limit = 20

  useEffect(() => {
    if (!canViewFees || !filterStudentId) return
    fetchApi<{ firstName: string; lastName: string; registrationNumber: string }>(
      `/api/students/${filterStudentId}`
    )
      .then((raw) => {
        const s = (raw as { data?: { firstName: string; lastName: string; registrationNumber: string } }).data ?? raw
        if (s?.registrationNumber) setSearch(s.registrationNumber)
      })
      .catch(() => {})
  }, [canViewFees, filterStudentId])

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (statusFilter) params.set('status', statusFilter)
  if (proofStatusFilter) params.set('proofStatus', proofStatusFilter)
  if (filterStudentId) params.set('studentId', filterStudentId)

  const { data, isLoading } = useQuery({
    queryKey: ['fees', page, statusFilter, filterStudentId],
    queryFn: () => fetchPaginatedApi<FeeInvoice>(`/api/fees?${params.toString()}`),
    staleTime: 30_000,
    enabled: canViewFees,
  })

  const invoices = data?.data ?? []
  const pagination = data?.pagination

  // Client-side search (student name / challan)
  const filtered = search
    ? invoices.filter((f) =>
        f.challanNumber.toLowerCase().includes(search.toLowerCase()) ||
        `${f.student.firstName} ${f.student.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        f.student.registrationNumber.toLowerCase().includes(search.toLowerCase())
      )
    : invoices

  // Route guard: teachers have no fee management workflow
  if (status === 'loading') return null
  if (!canViewFees) {
    return (
      <AccessDenied
        title="Fee Module Restricted"
        message="Access to the fee management module is restricted. Teachers are not part of the fee collection workflow."
      />
    )
  }

  return (
    <motion.div 
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* Collect payment modal */}
      <CollectPaymentModal invoice={collectInvoice} onClose={() => setCollectInvoice(null)} />
      
      {/* Upload proof modal (Students/Guardians) */}
      <PaymentProofUploadModal
        open={!!uploadInvoice}
        onOpenChange={(open) => { if (!open) setUploadInvoice(null) }}
        invoice={uploadInvoice}
        uploadEndpoint={uploadInvoice ? `/api/fees/${uploadInvoice.id}/proof` : ''}
        successMessage="Payment proof submitted successfully!"
        successQueryKeys={[['fees']]}
      />

      {/* Header */}
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <DollarSign className="w-6 h-6" />
            </div>
            Fees Management
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">
            {pagination ? `${pagination.total.toLocaleString()} challans total` : 'Loading...'}
          </p>
          {filterStudentId && (
            <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 mt-2 ml-11 w-fit">
              Showing challans for one student —{' '}
              <Link href={`/dashboard/students/${filterStudentId}`} className="underline font-medium">
                view profile
              </Link>
            </p>
          )}
        </div>
        {isAdmin && (
          <Link href="/dashboard/fees/generate">
            <Button className="gap-2 bg-green-600 hover:bg-green-700 transition-colors shadow-md hover:shadow-lg">
              <Plus className="w-4 h-4" />
              Generate Challan
            </Button>
          </Link>
        )}
      </motion.div>

      <motion.div variants={fadeUp(0.2)} className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-md overflow-hidden flex flex-col">
        {/* Search + filter bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Challan no., student name or reg..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Button 
              variant={proofStatusFilter === 'PENDING' ? 'default' : 'outline'}
              className={proofStatusFilter === 'PENDING' ? 'bg-amber-500 hover:bg-amber-600' : 'text-amber-600 border-amber-300'}
              onClick={() => {
                setProofStatusFilter(proofStatusFilter === 'PENDING' ? '' : 'PENDING')
                setPage(1)
              }}
            >
              Pending Proofs
            </Button>
          )}
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="relative w-full overflow-x-auto min-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Challan No.</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-64">
                    <EmptyState 
                      icon={FileText}
                      title="No fee records found"
                      description={search || statusFilter ? "Try adjusting your filters to find what you're looking for." : "There are currently no fee invoices generated."}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((fee) => {
                  const total = Number(fee.totalAmount)
                  const paid = Number(fee.paidAmount)
                  const balance = total - paid
                  const isOverdue = new Date(fee.dueDate) < new Date() && fee.status !== 'PAID'
                  return (
                    <TableRow key={fee.id} className="hover:bg-slate-50/80 transition-colors group">
                      <TableCell className="font-mono text-xs text-slate-600">{fee.challanNumber}</TableCell>
                      <TableCell>
                        <Link href={`/dashboard/students/${fee.student.id}`} className="hover:underline">
                          <p className="font-medium text-sm text-gray-900">
                            {fee.student.firstName} {fee.student.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{fee.student.registrationNumber}</p>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{fee.month}</TableCell>
                      <TableCell className="text-sm font-medium">Rs {total.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-green-700">Rs {paid.toLocaleString()}</TableCell>
                      <TableCell className={`text-sm font-medium ${balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {balance > 0 ? `Rs ${balance.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {new Date(fee.dueDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {isOverdue && ' ⚠'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[fee.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {fee.status.replace('_', ' ')}
                        </span>
                        {fee.proofStatus === 'PENDING' && (
                          <span className="ml-1 inline-flex text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-bold whitespace-nowrap">
                            PROOF PENDING
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isAdmin && fee.status !== 'PAID' && fee.status !== 'CANCELLED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 h-7 text-xs"
                              onClick={() => setCollectInvoice(fee)}
                            >
                              <DollarSign className="w-3 h-3" />
                              Collect
                            </Button>
                          )}
                          {!isAdmin && fee.status !== 'PAID' && fee.status !== 'CANCELLED' && fee.proofStatus !== 'PENDING' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 h-7 text-xs font-bold"
                              onClick={() => setUploadInvoice(fee)}
                            >
                              <UploadCloud className="w-3 h-3" />
                              Pay Fee
                            </Button>
                          )}
                          {!isAdmin && fee.proofStatus === 'PENDING' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="gap-1.5 border-amber-300 text-amber-600 bg-amber-50 h-7 text-[10px] font-bold"
                            >
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Pending
                            </Button>
                          )}
                          <Link href={`/dashboard/fees/${fee.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-500">
                              View
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-sm text-slate-500 font-medium">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 w-8 p-0 border-slate-200">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold px-2">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="h-8 w-8 p-0 border-slate-200">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
