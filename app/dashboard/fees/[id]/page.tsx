'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { PaymentProofUploadModal } from '@/components/fees/PaymentProofUploadModal'
import { ArrowLeft, Printer, Ban, Trash2, DollarSign, Loader2, FileText, CheckCircle, AlertTriangle, UploadCloud, Eye, Download } from 'lucide-react'
import Link from 'next/link'
import { notify } from '@/lib/notify'
import { paymentDetailsRowsFromSnapshot } from '@/lib/fees/payment-details'

interface FeeItem {
  id: string
  description: string
  amount: string | number
}

interface EnrollmentSection {
  status: string
  rollNumber?: string | null
  classSection?: {
    className?: string | null
    sectionName?: string | null
    shift?: { name?: string | null; code?: string | null } | null
  } | null
}

interface StudentDetails {
  id: string
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber?: string
  dueAmount: number
  campus: { name: string; code: string }
  batch?: { name: string }
  class?: { name: string; grade: number }
  enrollments?: EnrollmentSection[]
}

interface FeeInvoice {
  id: string
  challanNumber: string
  studentId: string
  month: string
  academicYear: string
  dueDate: string
  subtotal: string | number
  discount: string | number
  lateFee: string | number
  totalAmount: string | number
  paidAmount: string | number
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  notes?: string
  bankAccounts?: string
  proofUrl?: string
  proofStatus?: string
  proofRemarks?: string
  issuedBy: string
  createdAt: string
  items: FeeItem[]
  student: StudentDetails
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700 border-green-200',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  ISSUED: 'bg-blue-100 text-blue-700 border-blue-200',
  OVERDUE: 'bg-red-100 text-red-700 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const renderBankAccountsTable = (bankAccountsStr: string) => {
  const rows = paymentDetailsRowsFromSnapshot(bankAccountsStr)
  if (rows.length === 0) {
    return <p className="text-[10px] text-gray-500 italic">Please deposit cash at the Accounts Office.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-1.5 w-full">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="flex justify-between gap-3 rounded border border-gray-200 bg-white px-2 py-1 text-[9px]">
          <span className="font-bold uppercase text-gray-600">{row.label}</span>
          <span className="text-right font-mono font-bold text-blue-900">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function FeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Collect Payment state
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [transactionId, setTransactionId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  
  const { data: session } = useSession()
  const role = (session?.user?.role as string) || ''

  // Student upload state
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Admin verify state
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyAction, setVerifyAction] = useState<'APPROVE'|'REJECT'>('APPROVE')
  const [verifyRemarks, setVerifyRemarks] = useState('')
  const [verifyPaidAmount, setVerifyPaidAmount] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editMonth, setEditMonth] = useState('')
  const [editAcademicYear, setEditAcademicYear] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editDiscount, setEditDiscount] = useState('0')
  const [editLateFee, setEditLateFee] = useState('0')
  const [editNotes, setEditNotes] = useState('')
  const [editItems, setEditItems] = useState<Array<{ description: string; amount: string }>>([])

  // Fetch Invoice details
  const { data: invoice, isLoading, error } = useQuery<FeeInvoice>({
    queryKey: ['fee-invoice', id],
    queryFn: () => fetchApi<FeeInvoice>(`/api/fees/${id}`),
    staleTime: 30_000,
  })

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: () => fetchApi(`/api/fees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' })
    }),
    onSuccess: () => {
      notify.success('Challan cancelled successfully')
      queryClient.invalidateQueries({ queryKey: ['fee-invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['fees'] })
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to cancel challan')
    }
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: () => fetchApi(`/api/fees/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Challan deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['fees'] })
      router.push('/dashboard/fees')
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to delete challan')
    }
  })

  const editMutation = useMutation({
    mutationFn: () => fetchApi(`/api/fees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        month: editMonth,
        academicYear: editAcademicYear,
        dueDate: editDueDate,
        discount: Number(editDiscount) || 0,
        lateFee: Number(editLateFee) || 0,
        notes: editNotes || null,
        items: editItems.map((item) => ({ description: item.description.trim(), amount: Number(item.amount) })),
      }),
    }),
    onSuccess: () => {
      notify.success('Challan updated and republished successfully')
      setShowEditDialog(false)
      queryClient.invalidateQueries({ queryKey: ['fee-invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['fees'] })
    },
    onError: (err: any) => notify.error(err.message || 'Failed to update challan'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Failed to load invoice</h2>
        <p className="text-sm text-gray-500">The requested fee record could not be found or you do not have permission to view it.</p>
        <Link href="/dashboard/fees">
          <Button variant="outline" className="mt-2">Back to List</Button>
        </Link>
      </div>
    )
  }

  const subtotal = Number(invoice.subtotal)
  const discount = Number(invoice.discount)
  const lateFee = Number(invoice.lateFee)
  const total = Number(invoice.totalAmount)
  const paid = Number(invoice.paidAmount)
  const balance = total - paid
  const admissionFee = invoice.items.reduce((sum, item) => /admission fee/i.test(item.description) ? sum + Number(item.amount) : sum, 0)
  const courseFee = invoice.items.reduce((sum, item) => /course(?:s)? fee/i.test(item.description) ? sum + Number(item.amount) : sum, 0)
  const academicFeeTotal = admissionFee + courseFee

  // Safe date parser — handles both ISO timestamp strings and plain date strings
  // to avoid Invalid Date when the DB stores a full UTC timestamp.
  const parseSafeDate = (raw: string | null | undefined): Date | null => {
    if (!raw) return null
    // If raw is already a date-only string (YYYY-MM-DD), appending T00:00:00 is safe.
    // If it includes a 'T' it is a full ISO string — parse directly.
    const d = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }

  const dueDateObj = parseSafeDate(invoice.dueDate)
  const dueDateDisplay = dueDateObj
    ? dueDateObj.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  // Resolve class + section + shift from the active enrollment (most specific) or fall back to student.class
  const activeEnrollment = invoice.student.enrollments?.[0]
  const enrolledClassName   = activeEnrollment?.classSection?.className   || invoice.student.class?.name || null
  const enrolledSectionName = activeEnrollment?.classSection?.sectionName || null
  const enrolledShiftName   = activeEnrollment?.classSection?.shift?.name || null

  const classSectionDisplay = [
    enrolledClassName,
    enrolledSectionName,
    enrolledShiftName,
  ].filter(Boolean).join(' — ') || 'Not Assigned'

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = parseFloat(payAmount)
    if (!amountNum || amountNum <= 0) {
      notify.error('Please enter a valid positive amount')
      return
    }
    if (amountNum > balance) {
      notify.error(`Amount exceeds remaining balance of Rs ${balance.toLocaleString()}`)
      return
    }

    setIsRecording(true)
    try {
      await fetchApi(`/api/fees/${invoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amountNum,
          paymentMethod: payMethod,
          transactionId: transactionId || undefined,
          remarks: remarks || undefined,
        }),
      })
      notify.success('Payment recorded successfully!')
      setShowPayModal(false)
      setPayAmount('')
      setTransactionId('')
      setRemarks('')
      queryClient.invalidateQueries({ queryKey: ['fee-invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['fees'] })
    } catch (err: any) {
      notify.error(err.message || 'Failed to record payment')
    } finally {
      setIsRecording(false)
    }
  }


  const handleVerifyProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (verifyAction === 'REJECT' && !verifyRemarks) {
      notify.error('Please provide a reason for rejection')
      return
    }

    const paidNum = verifyPaidAmount ? parseFloat(verifyPaidAmount) : undefined

    setIsVerifying(true)
    try {
      await fetchApi(`/api/fees/${invoice.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          action: verifyAction,
          remarks: verifyRemarks || undefined,
          paidAmount: paidNum && paidNum > 0 ? paidNum : undefined,
        }),
      })
      notify.success(`Proof ${verifyAction.toLowerCase()}d successfully!`)
      setShowVerifyModal(false)
      setVerifyRemarks('')
      setVerifyPaidAmount('')
      queryClient.invalidateQueries({ queryKey: ['fee-invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['fees'] })
    } catch (err: any) {
      notify.error(err.message || 'Failed to verify proof')
    } finally {
      setIsVerifying(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    const container = document.getElementById('challan-container')
    if (!container) {
      notify.error('Could not find challan copies to generate PDF')
      return
    }

    setIsDownloadingPdf(true)
    try {
      const { downloadPdf } = await import('@/lib/pdf')
      const challanNo = invoice?.challanNumber?.replace(/[^A-Za-z0-9_-]/g, '_') || 'Challan'
      await downloadPdf({
        element: container,
        filename: `Challan_${challanNo}`,
        orientation: 'portrait',
        format: 'a4',
        scale: 2,
      })
      notify.success('Challan PDF downloaded successfully!')
    } catch (err) {
      console.error('[Challan PDF]', err)
      notify.error('Failed to generate PDF. Please try using the Print option instead.')
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  // Double check if challan can be deleted (only if ISSUED/unpaid)
  const canDelete = invoice.status === 'ISSUED' && paid === 0
  
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(role)
  const isStudentOrGuardian = ['STUDENT', 'PARENT', 'GUARDIAN'].includes(role)
  const canEdit = isAdmin && paid === 0 && ['ISSUED', 'OVERDUE'].includes(invoice.status)
  const openEditDialog = () => {
    setEditMonth(invoice.month)
    setEditAcademicYear(invoice.academicYear)
    setEditDueDate(invoice.dueDate.slice(0, 10))
    setEditDiscount(String(discount))
    setEditLateFee(String(lateFee))
    setEditNotes(invoice.notes || '')
    setEditItems(invoice.items.map((item) => ({ description: item.description, amount: String(item.amount) })))
    setShowEditDialog(true)
  }

  return (
    <div className="space-y-6">
      {/* Administrative Buttons (Hidden during printing) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-white rounded-xl border shadow-sm no-print">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/fees">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              Challan Detail: <span className="font-mono text-sm text-gray-500">{invoice.challanNumber}</span>
            </h1>
            <p className="text-xs text-gray-500">Manage, record payments, and print this student fee challan form.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Print Slip */}
          <Button onClick={handlePrint} variant="outline" className="text-slate-700 border-slate-300 font-bold gap-2 text-xs h-9">
            <Printer className="w-3.5 h-3.5" />
            Print Slips
          </Button>

          <Link href={`/dashboard/fees/${id}/download`}>
            <Button variant="outline" className="text-slate-700 border-slate-300 font-bold gap-2 text-xs h-9">
              <FileText className="w-3.5 h-3.5" />
              Download Views
            </Button>
          </Link>

          {/* Download PDF */}
          <Button onClick={handleDownloadPdf} disabled={isDownloadingPdf} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 text-xs h-9 shadow-sm">
            {isDownloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download PDF
          </Button>

          {/* Collect Payment (Admin Only) */}
          {isAdmin && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
            <Button onClick={() => { setPayAmount(String(balance)); setShowPayModal(true) }} className="bg-green-600 hover:bg-green-700 text-white font-bold gap-2 text-xs h-9">
              <DollarSign className="w-3.5 h-3.5" />
              Collect Payment
            </Button>
          )}

          {canEdit && (
            <Button onClick={openEditDialog} variant="outline" className="text-indigo-700 border-indigo-300 hover:bg-indigo-50 font-bold gap-2 text-xs h-9">
              <FileText className="w-3.5 h-3.5" />
              Edit & Republish
            </Button>
          )}

          {/* Verify Proof (Admin Only) */}
          {isAdmin && invoice.proofStatus === 'PENDING' && (
            <Button onClick={() => setShowVerifyModal(true)} className="bg-amber-500 hover:bg-amber-600 text-white font-bold gap-2 text-xs h-9">
              <CheckCircle className="w-3.5 h-3.5" />
              Verify Uploaded Proof
            </Button>
          )}

          {/* Upload Proof (Student/Guardian Only) */}
          {isStudentOrGuardian && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && invoice.proofStatus !== 'PENDING' && (
            <Button onClick={() => setShowUploadModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 text-xs h-9">
              <UploadCloud className="w-3.5 h-3.5" />
              Upload Receipt
            </Button>
          )}
          
          {isStudentOrGuardian && invoice.proofStatus === 'PENDING' && (
            <Button variant="outline" disabled className="text-amber-600 border-amber-300 font-bold gap-2 text-xs h-9">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Verification Pending
            </Button>
          )}

          {/* Cancel */}
          {isAdmin && invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && (
            <Button 
              variant="outline" 
              onClick={() => { if(confirm('Are you sure you want to cancel this fee invoice?')) cancelMutation.mutate() }}
              disabled={cancelMutation.isPending}
              className="text-amber-700 hover:bg-amber-50 border-amber-300 font-bold gap-2 text-xs h-9"
            >
              {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Cancel Challan
            </Button>
          )}

          {/* Delete (Admin only & Unpaid) */}
          {isAdmin && canDelete && (
            <Button 
              variant="outline" 
              onClick={() => { if(confirm('Are you sure you want to permanently delete this unpaid fee invoice?')) deleteMutation.mutate() }}
              disabled={deleteMutation.isPending}
              className="text-red-600 hover:bg-red-50 border-red-300 font-bold gap-2 text-xs h-9"
            >
              {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Payment Proof Status Card (visible when proof has been uploaded) */}
      {(invoice.proofUrl || invoice.proofStatus) && (
        <div className="no-print bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-blue-500" />
              Payment Proof Status
            </h2>
            <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-bold border ${
              invoice.proofStatus === 'APPROVED'
                ? 'bg-green-100 text-green-700 border-green-200'
                : invoice.proofStatus === 'REJECTED'
                  ? 'bg-red-100 text-red-700 border-red-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
            }`}>
              {invoice.proofStatus === 'APPROVED' && <CheckCircle className="w-3 h-3 mr-1" />}
              {invoice.proofStatus === 'REJECTED' && <AlertTriangle className="w-3 h-3 mr-1" />}
              {invoice.proofStatus === 'PENDING' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {invoice.proofStatus ?? 'UNKNOWN'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-[300px_1fr]">
            {/* Proof Image */}
            {invoice.proofUrl && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={invoice.proofUrl}
                  alt="Payment proof"
                  className="w-full h-48 object-contain cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => window.open(invoice.proofUrl!, '_blank')}
                />
                <div className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => window.open(invoice.proofUrl!, '_blank')}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Click to view full size →
                  </button>
                </div>
              </div>
            )}

            {/* Proof Details */}
            <div className="space-y-3">
              {invoice.proofRemarks && (
                <div className={`rounded-xl p-3 border text-sm ${
                  invoice.proofStatus === 'REJECTED'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <p className="font-semibold text-xs uppercase tracking-wide mb-1">
                    {invoice.proofStatus === 'REJECTED' ? 'Rejection Reason' : 'Remarks'}
                  </p>
                  <p>{invoice.proofRemarks}</p>
                </div>
              )}

              {invoice.proofStatus === 'APPROVED' && (
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  <p className="font-semibold">✓ This payment proof has been verified and accepted by the accounts team.</p>
                </div>
              )}

              {invoice.proofStatus === 'PENDING' && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <p className="font-semibold">⏳ Your proof is under review by the accounts team. You will be notified once verified.</p>
                </div>
              )}

              {invoice.proofStatus === 'REJECTED' && isStudentOrGuardian && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
                <Button
                  onClick={() => setShowUploadModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2 mt-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  Re-upload Corrected Receipt
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main printable slip container */}
      {/* We display a triplicate challan: 1. Bank Copy, 2. Office Copy, 3. Student Copy */}
      <div id="challan-container" className="triplicate-container grid grid-cols-1 xl:grid-cols-3 gap-6 p-1 bg-white rounded-xl" style={{ padding: '20px' }}>
        
        {/* Render Bank, Office, and Student copies */}
        {(['BANK COPY', 'OFFICE COPY', 'STUDENT COPY'] as const).map((copyType) => (
          <div key={copyType} data-document-page data-challan-copy={copyType} className="bg-white p-5 border border-gray-300 rounded-lg shadow-sm font-sans relative flex flex-col justify-between min-h-[600px] w-full text-black">
            
            {/* Slip Header */}
            <div className="space-y-2 pb-3 border-b-2 border-dashed border-gray-400">
              <div className="text-center">
                <h2 className="text-sm font-black uppercase tracking-wider text-blue-900">EverShine Academy</h2>
                <p className="text-[9px] text-gray-500 uppercase tracking-tight">Main Campus, Gujranwala, Pakistan</p>
                <div className="mt-1 inline-block bg-blue-100 border border-blue-300 text-blue-800 text-[8px] font-black px-2 py-0.5 rounded">
                  {copyType}
                </div>
              </div>
            </div>

            {/* Challan Meta Info */}
            <div className="grid grid-cols-2 gap-2 text-[10px] py-3 border-b">
              <div className="space-y-0.5">
                <p className="text-gray-500">Challan Number:</p>
                <p className="font-mono font-bold text-gray-900">{invoice.challanNumber}</p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className="text-gray-500">Period/Month:</p>
                <p className="font-bold text-gray-900">{invoice.month}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-gray-500">Issue Date:</p>
                <p className="font-bold text-gray-900">{new Date(invoice.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className="text-red-600 font-bold text-[9px]">Due Date:</p>
                <p className="font-bold text-red-600">{dueDateDisplay}</p>
              </div>
            </div>

            {/* Student Info Box */}
            <div className="bg-gray-50 border p-2.5 rounded-md text-[10px] space-y-1 my-3">
              <div className="grid grid-cols-2">
                <p className="text-gray-500">Reg Number:</p>
                <p className="font-bold text-right">{invoice.student.registrationNumber}</p>
              </div>
              <div className="grid grid-cols-2">
                <p className="text-gray-500">Student Name:</p>
                <p className="font-bold text-right truncate">{invoice.student.firstName} {invoice.student.lastName}</p>
              </div>
              <div className="grid grid-cols-2">
                <p className="text-gray-500">Campus:</p>
                <p className="font-medium text-right truncate">{invoice.student.campus.name}</p>
              </div>
              <div className="grid grid-cols-2">
                <p className="text-gray-500">Class / Section:</p>
                <p className="font-medium text-right truncate">{classSectionDisplay}</p>
              </div>
              {enrolledShiftName && (
                <div className="grid grid-cols-2">
                  <p className="text-gray-500">Shift:</p>
                  <p className="font-medium text-right truncate">{enrolledShiftName}</p>
                </div>
              )}
            </div>

            {(admissionFee > 0 || courseFee > 0) && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[10px] mb-3 space-y-2">
                <div className="font-semibold uppercase tracking-[0.08em] text-slate-700 text-[10px]">Academic Fee Breakdown</div>
                {admissionFee > 0 && (
                  <div className="flex justify-between text-slate-800">
                    <span>Admission Fee</span>
                    <span className="font-mono">Rs {admissionFee.toLocaleString()}</span>
                  </div>
                )}
                {courseFee > 0 && (
                  <div className="flex justify-between text-slate-800">
                    <span>Course Fee</span>
                    <span className="font-mono">Rs {courseFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                  <span>Total Academic Fee</span>
                  <span className="font-mono">Rs {academicFeeTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Fees Items list */}
            <div className="flex-grow space-y-2">
              <div className="border-b pb-1 text-[9px] font-bold text-gray-500 flex justify-between">
                <span>Fee Description</span>
                <span>Amount (PKR)</span>
              </div>
              <div className="space-y-1 text-[10px]">
                {invoice.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-gray-700">
                    <span className="truncate pr-2">{item.description}</span>
                    <span className="font-mono">Rs {Number(item.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Summary */}
            <div className="border-t pt-2 mt-4 space-y-1 text-[10px]">
              <div className="flex justify-between text-gray-500 text-[9px]">
                <span>Subtotal:</span>
                <span className="font-mono">Rs {subtotal.toLocaleString()}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-700 text-[9px]">
                  <span>Discount:</span>
                  <span className="font-mono">- Rs {discount.toLocaleString()}</span>
                </div>
              )}
              {lateFee > 0 && (
                <div className="flex justify-between text-red-600 text-[9px] font-bold">
                  <span>⚠ Late Fee / Penalty:</span>
                  <span className="font-mono">+ Rs {lateFee.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-[11px] text-blue-900 border-t-2 border-blue-200 pt-1.5 mt-1 bg-blue-50 px-1 py-0.5 rounded">
                <span>Grand Total:</span>
                <span className="font-mono">Rs {total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[9px] text-green-800 font-medium">
                <span>Paid Amount:</span>
                <span className="font-mono">Rs {paid.toLocaleString()}</span>
              </div>
              {balance > 0 && (
                <div className="flex justify-between text-[9px] text-red-700 font-extrabold bg-red-50 px-1 py-0.5 rounded mt-0.5">
                  <span>Outstanding Balance:</span>
                  <span className="font-mono">Rs {balance.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Note & Policy terms */}
            <div className="mt-4 pt-3 border-t text-[8px] text-gray-500 leading-tight space-y-1">
              <p className="font-bold text-gray-700 mb-2">Deposit Instructions:</p>
              {renderBankAccountsTable(invoice.bankAccounts || '')}
              <p>1. Please verify details before deposit.</p>
              <p>2. Fine of Rs. 100/day applies on late payments after the specified due date.</p>
              <p>3. Fee is non-refundable and non-transferable.</p>
            </div>

            {/* Signature Area */}
            <div className="pt-6 mt-4 border-t border-dashed flex justify-between items-end text-[9px] text-gray-400">
              <div className="w-24 text-center">
                <div className="h-6 border-b border-gray-300"></div>
                <span className="mt-1 block">Depositor Sign</span>
              </div>
              <div className="w-24 text-center">
                <div className="h-6 border-b border-gray-300"></div>
                <span className="mt-1 block">Officer / Cashier</span>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Collect Payment Dialog */}
      <Dialog open={showPayModal} onOpenChange={setShowPayModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Collect Invoice Payment
            </DialogTitle>
            <DialogDescription>
              Challan: <span className="font-mono font-bold">{invoice.challanNumber}</span>
              <br />
              Student: <span className="font-medium">{invoice.student.firstName} {invoice.student.lastName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-3">
                <p className="text-xs text-blue-600 font-medium">Total Balance</p>
                <p className="text-lg font-bold text-blue-800">Rs {balance.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-3">
                <p className="text-xs text-green-600 font-medium">Paid Amount</p>
                <p className="text-lg font-bold text-green-800">Rs {paid.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Payment Amount (Rs)</Label>
              <Input
                type="number"
                placeholder={`Outstanding: ${balance}`}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                min={1}
                max={balance}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payMethod !== 'Cash' && (
              <div className="space-y-1.5">
                <Label>Transaction / Reference ID</Label>
                <Input
                  placeholder="Bank reference number"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Remarks (optional)</Label>
              <Input
                placeholder="Remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPayModal(false)} disabled={isRecording}>
                Cancel
              </Button>
              <Button type="submit" disabled={isRecording} className="bg-green-600 hover:bg-green-700 text-white font-bold">
                {isRecording ? 'Processing...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Safe correction flow: only issued/overdue invoices with no payment can
          be edited. The server revalidates this rule and recalculates totals. */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit & Republish Challan</DialogTitle>
            <DialogDescription>
              Correct the period, line items, or notes before any payment is recorded. Official payment instructions remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); editMutation.mutate() }} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Month</Label><Input value={editMonth} onChange={(e) => setEditMonth(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Academic Year</Label><Input value={editAcademicYear} onChange={(e) => setEditAcademicYear(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} required /></div>
            </div>
            <div className="space-y-2">
              <Label>Fee Items</Label>
              {editItems.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_140px_auto] gap-2">
                  <Input value={item.description} onChange={(e) => setEditItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, description: e.target.value } : row))} required />
                  <Input type="number" min="0.01" step="0.01" value={item.amount} onChange={(e) => setEditItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: e.target.value } : row))} required />
                  <Button type="button" variant="outline" size="icon" disabled={editItems.length === 1} onClick={() => setEditItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setEditItems((current) => [...current, { description: '', amount: '' }])}>Add fee item</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Discount (PKR)</Label><Input type="number" min="0" step="0.01" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Late Fee (PKR)</Label><Input type="number" min="0" step="0.01" value={editLateFee} onChange={(e) => setEditLateFee(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} maxLength={500} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)} disabled={editMutation.isPending}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={editMutation.isPending || editItems.some((item) => !item.description.trim() || Number(item.amount) <= 0)}>{editMutation.isPending ? 'Saving…' : 'Save & Republish'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PaymentProofUploadModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        invoice={invoice}
        uploadEndpoint={`/api/fees/${invoice.id}/proof`}
        successMessage="Payment proof submitted successfully!"
        successQueryKeys={[['fee-invoice', id], ['fees']]}
      />

      {/* Verify Proof Dialog */}
      <Dialog open={showVerifyModal} onOpenChange={setShowVerifyModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-amber-500" />
              Verify Uploaded Proof
            </DialogTitle>
            <DialogDescription>
              Review the student's payment receipt before approving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-gray-100 p-2 rounded-lg border flex justify-center max-h-[300px] overflow-hidden">
              {invoice.proofUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={invoice.proofUrl} alt="Payment Proof" className="object-contain w-full h-full" />
              ) : (
                <div className="p-8 text-gray-400 flex flex-col items-center">
                  <Ban className="w-8 h-8 mb-2 opacity-50" />
                  <p>No valid image provided</p>
                </div>
              )}
            </div>
            {invoice.proofRemarks && (
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-sm text-amber-900">
                <strong>Student Note:</strong> {invoice.proofRemarks}
              </div>
            )}
            
            <form onSubmit={handleVerifyProof} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select value={verifyAction} onValueChange={(val: 'APPROVE'|'REJECT') => setVerifyAction(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVE">Approve & Mark Paid</SelectItem>
                    <SelectItem value="REJECT">Reject Upload</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {verifyAction === 'APPROVE' && (
                <div className="space-y-1.5">
                  <Label>Verified Paid Amount (PKR)</Label>
                  <Input
                    type="number"
                    placeholder={`Remaining: ${balance}`}
                    value={verifyPaidAmount}
                    onChange={(e) => setVerifyPaidAmount(e.target.value)}
                    min={1}
                    max={balance}
                  />
                  <p className="text-[11px] text-slate-500">Leave blank for full payment. Enter lesser amount for partial.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Admin Remarks {verifyAction === 'REJECT' && <span className="text-red-500">*</span>}</Label>
                <Input
                  placeholder={verifyAction === 'REJECT' ? 'Reason for rejection (Required)' : 'Optional notes...'}
                  value={verifyRemarks}
                  onChange={(e) => setVerifyRemarks(e.target.value)}
                  required={verifyAction === 'REJECT'}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowVerifyModal(false)} disabled={isVerifying}>Cancel</Button>
                <Button 
                  type="submit" 
                  disabled={isVerifying} 
                  className={verifyAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700 text-white font-bold' : 'bg-red-600 hover:bg-red-700 text-white font-bold'}
                >
                  {isVerifying ? 'Processing...' : verifyAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Global CSS to style printing layouts */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .triplicate-container {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            background: transparent !important;
            padding: 0 !important;
            gap: 15px !important;
            min-width: 100% !important;
            box-shadow: none !important;
          }
          .triplicate-container > div {
            border: 1px solid #000 !important;
            box-shadow: none !important;
            padding: 10px !important;
            border-radius: 4px !important;
            font-size: 9px !important;
          }
        }
      `}</style>
    </div>
  )
}
