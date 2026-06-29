'use client'

import { FormEvent, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { CalendarDays, FileText, CheckCircle, X, XCircle, Clock, User, UserCheck, ArrowRight, ShieldAlert, Inbox, Loader2, Trash2, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'

interface LeaveRequest {
  id: string
  applicantId: string
  applicantName: string
  applicantRole: string
  leaveType: 'CASUAL' | 'SICK' | 'MATERNITY' | 'EMERGENCY' | 'OTHER'
  startDate: string
  endDate: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  remarks: string | null
  reviewedName: string | null
  createdAt: string
}

const STATUS_STYLES = {
  PENDING:  'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
}
const STATUS_ICONS = { PENDING: Clock, APPROVED: CheckCircle, REJECTED: XCircle }

type LeaveApplicationPayload = {
  leaveType: LeaveRequest['leaveType']
  startDate: string
  endDate: string
  reason: string
}

type ReviewPayload = {
  id: string
  data: {
    status: 'APPROVED' | 'REJECTED'
    remarks: string
  }
}

const getApiMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred.'

export default function LeavesPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role ?? ''
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
  const canApply = userRole === 'TEACHER' || userRole === 'ACCOUNTANT' || userRole === 'STUDENT'

  // Form state (applicants only)
  const [leaveType, setLeaveType] = useState<LeaveRequest['leaveType']>('CASUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  // Review state (admins only)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [remarks, setRemarks] = useState('')
  const [isReviewing, setIsReviewing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  const { data: leavesData, isLoading } = useQuery({
    queryKey: ['leaves'],
    queryFn: () => fetchPaginatedApi<LeaveRequest>('/api/leaves?limit=100'),
    enabled: !!session && (isAdmin || canApply),
  })
  const leaves = leavesData?.data ?? []
  const pending = leaves.filter(l => l.status === 'PENDING')
  const reviewed = leaves.filter(l => l.status !== 'PENDING')
  const isApplicant = !isAdmin && canApply
  const myLeaves = isApplicant ? leaves : reviewed
  const sortedMyLeaves = [...myLeaves].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const myPendingCount = sortedMyLeaves.filter(l => l.status === 'PENDING').length
  const myApprovedCount = sortedMyLeaves.filter(l => l.status === 'APPROVED').length
  const myRejectedCount = sortedMyLeaves.filter(l => l.status === 'REJECTED').length

  const submitMutation = useMutation<unknown, unknown, LeaveApplicationPayload>({
    mutationFn: (d) => fetchApi('/api/leaves', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves'] })
      notify.success('Application Submitted', { description: 'Your request is awaiting admin review.' })
      setStartDate(''); setEndDate(''); setReason('')
    },
    onError: (e: unknown) => notify.error('Submission Failed', { description: getApiMessage(e) }),
  })

  const reviewMutation = useMutation<LeaveRequest, unknown, ReviewPayload>({
    mutationFn: ({ id, data }) =>
      fetchApi(`/api/leaves/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['leaves'] })
      const action = vars.data.status === 'APPROVED' ? 'Approved' : 'Rejected'
      const summary = vars.data.status === 'APPROVED'
        ? 'The applicant has been notified and the decision is now final.'
        : 'The applicant has been notified and may reapply with updated details.'
      notify.success(`Request ${action}`, { description: 'The applicant has been notified.' })
      setActionFeedback(`Leave request has been ${action.toLowerCase()} successfully. ${summary}`)
      setReviewId(null); setRemarks('')
    },
    onError: (e: unknown) => notify.error('Review Failed', { description: getApiMessage(e) }),
  })

  const deleteMutation = useMutation<unknown, unknown, string>({
    mutationFn: (id: string) => fetchApi(`/api/leaves/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves'] })
      notify.success('Request Removed', { description: 'The request has been deleted successfully.' })
      setActionFeedback('The pending leave request has been withdrawn and removed from your history.')
    },
    onError: (e: unknown) => notify.error('Delete Failed', { description: getApiMessage(e) }),
  })

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!startDate || !endDate || !reason.trim()) {
      notify.error('Missing Fields', { description: 'Fill in all required fields.' }); return
    }
    if (new Date(endDate) < new Date(startDate)) {
      notify.error('Invalid Dates', { description: 'End date must be after start date.' }); return
    }
    setIsSubmitting(true)
    try { await submitMutation.mutateAsync({ leaveType, startDate, endDate, reason }) }
    finally { setIsSubmitting(false) }
  }

  const handleReview = async (status: 'APPROVED' | 'REJECTED') => {
    if (!reviewId) return
    setIsReviewing(true)
    try { await reviewMutation.mutateAsync({ id: reviewId, data: { status, remarks } }) }
    finally { setIsReviewing(false) }
  }

  // Block roles that neither apply nor review
  if (!isAdmin && !canApply) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center p-6 space-y-4">
        <div className="p-4 bg-rose-50 rounded-full border border-rose-200 text-rose-600"><Lock className="w-10 h-10" /></div>
        <h2 className="text-2xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-slate-500 text-sm">Leave management is available to teaching staff and account managers only.</p>
      </div>
    )
  }

  const reviewTarget = leaves.find(l => l.id === reviewId)

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div variants={fadeUp(0.1)} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent)]" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold mb-4">
            <CalendarDays className="w-3.5 h-3.5" />
            {isAdmin ? 'Leave Request Management' : 'Leave Applications'}
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {isAdmin ? 'Staff Leave Review Desk' : 'Apply for Leave'}
          </h1>
          <p className="mt-2 text-blue-100 max-w-2xl text-sm leading-relaxed">
            {isAdmin
              ? 'Review, approve, or reject leave requests from teaching staff and account managers. Each decision triggers an instant notification to the applicant.'
              : 'Submit formal absence requests. All applications are reviewed by the administration and you will be notified of the decision.'}
          </p>
        </div>
      </motion.div>

      {actionFeedback && (
        <Card className="border-l-4 border-emerald-500 bg-emerald-50/80 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-emerald-800 leading-6">{actionFeedback}</p>
            <Button size="sm" variant="ghost" className="text-emerald-700 hover:text-emerald-900" onClick={() => setActionFeedback(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <motion.div variants={fadeUp(0.2)} className="lg:col-span-5 space-y-6">

          {/* Admin: Review Panel */}
          {isAdmin && reviewId && reviewTarget && (
            <Card className="border-[2px] border-amber-500/40 bg-amber-50/60 shadow-md animate-in fade-in duration-200">
              <CardHeader>
                <CardTitle className="text-amber-800 flex items-center gap-2 text-lg">
                  <UserCheck className="w-5 h-5 text-amber-600" /> Evaluate Request
                </CardTitle>
                <CardDescription className="text-amber-700/80">
                  Set your decision and add optional feedback for the applicant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white border border-amber-200/50 p-4 rounded-xl text-sm space-y-1.5">
                  <p className="font-bold text-slate-800">{reviewTarget.applicantName} <span className="text-xs font-normal text-slate-500">({reviewTarget.applicantRole})</span></p>
                  <p className="text-xs text-slate-500">Type: <strong>{reviewTarget.leaveType}</strong> &nbsp;|&nbsp; {new Date(reviewTarget.startDate).toLocaleDateString()} → {new Date(reviewTarget.endDate).toLocaleDateString()}</p>
                  <p className="text-slate-600 italic text-xs mt-1">&ldquo;{reviewTarget.reason}&rdquo;</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Feedback Remarks (optional)</label>
                  <Input placeholder="e.g. Approved as per HR policy" value={remarks} onChange={e => setRemarks(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" disabled={isReviewing} onClick={() => handleReview('APPROVED')}>
                    {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : '✅ Approve'}
                  </Button>
                  <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold" disabled={isReviewing} onClick={() => handleReview('REJECTED')}>
                    {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : '❌ Reject'}
                  </Button>
                  <Button variant="outline" onClick={() => { setReviewId(null); setRemarks('') }}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Admin: placeholder when no review active */}
          {isAdmin && !reviewId && (
            <Card className="border border-slate-200 bg-slate-50/50 p-8 text-center shadow-sm">
              <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-700">Select a Request</h3>
              <p className="text-xs text-slate-500 mt-1">Click &ldquo;Evaluate&rdquo; on a pending request from the list to open the review panel here.</p>
            </Card>
          )}

          {/* Staff: Application Form */}
          {canApply && (
            <Card className="border border-slate-200/80 shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" /> Apply for Leave
                </CardTitle>
                <CardDescription className="text-slate-500">Submit a formal absence request to the administration.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Leave Type</label>
                    <Select value={leaveType} onValueChange={(v: LeaveRequest['leaveType']) => setLeaveType(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASUAL">Casual Leave</SelectItem>
                        <SelectItem value="SICK">Sick Leave</SelectItem>
                        <SelectItem value="MATERNITY">Maternity Leave</SelectItem>
                        <SelectItem value="EMERGENCY">Emergency Leave</SelectItem>
                        <SelectItem value="OTHER">Other / Special</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Start Date</label>
                      <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">End Date</label>
                      <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reason</label>
                    <textarea rows={4} value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="Provide a detailed explanation..." required
                      className="w-full text-sm rounded-lg border border-slate-300/80 p-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2.5 flex items-center justify-center gap-2">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Submit Application</span><ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Right Column: Request List */}
        <motion.div variants={fadeUp(0.3)} className="lg:col-span-7 space-y-6">
          {/* Pending Queue (admin) */}
          {isAdmin && (
            <Card className="border-[2px] border-indigo-500/30 shadow-md">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-lg font-bold text-indigo-700 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" /> Pending Approvals
                  {pending.length > 0 && <span className="ml-1 bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="animate-spin w-5 h-5" /><span className="text-sm">Loading...</span></div>
                ) : pending.length === 0 ? (
                  <div className="py-12 text-center text-slate-400"><Inbox className="w-10 h-10 mx-auto mb-2 text-slate-300" /><p className="text-sm">No pending requests</p></div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {pending.map(r => (
                      <div key={r.id} className="p-4 hover:bg-slate-50 transition-all flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">{r.applicantName}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-500">{r.applicantRole}</span>
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-[10px] font-bold text-indigo-600">{r.leaveType}</span>
                          </div>
                          <p className="text-xs text-slate-500">{new Date(r.startDate).toLocaleDateString()} → {new Date(r.endDate).toLocaleDateString()}</p>
                          <p className="text-xs text-slate-600 italic">&ldquo;{r.reason}&rdquo;</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                            onClick={() => { setReviewId(r.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                            Evaluate
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 h-auto"
                            onClick={() => { if (confirm('Remove this request and notify the applicant?')) deleteMutation.mutate(r.id) }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Total Requests</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{leaves.length}</p>
              <p className="mt-2 text-xs text-slate-500">{isAdmin ? 'All leave requests in the system' : 'Your submitted leave applications'}</p>
            </div>
            <div className="rounded-3xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-700">Pending</p>
              <p className="mt-3 text-3xl font-semibold text-amber-900">{pending.length}</p>
              <p className="mt-2 text-xs text-amber-700">Requests awaiting review</p>
            </div>
            <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/80 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-700">Approved</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-900">{myApprovedCount}</p>
              <p className="mt-2 text-xs text-emerald-700">Requests approved so far</p>
            </div>
            <div className="rounded-3xl border border-rose-200/80 bg-rose-50/80 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-rose-700">Rejected</p>
              <p className="mt-3 text-3xl font-semibold text-rose-900">{myRejectedCount}</p>
              <p className="mt-2 text-xs text-rose-700">Requests declined or withdrawn</p>
            </div>
          </div>

          {/* History / Own Requests */}
          <Card className="border border-slate-200/80 shadow-md">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                {isAdmin ? 'Reviewed Requests Log' : 'My Leave History'}
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                {isAdmin
                  ? `Showing ${sortedMyLeaves.length} reviewed request${sortedMyLeaves.length === 1 ? '' : 's'}.`
                  : `Showing ${sortedMyLeaves.length} application${sortedMyLeaves.length === 1 ? '' : 's'} — ${myPendingCount} pending, ${myApprovedCount} approved, ${myRejectedCount} rejected.`}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="animate-spin w-5 h-5" /></div>
              ) : sortedMyLeaves.length === 0 ? (
                <div className="py-14 text-center text-slate-400"><Inbox className="w-10 h-10 mx-auto mb-2 text-slate-300" /><p className="text-sm">{isAdmin ? 'No records yet' : 'You have not submitted any leave requests yet.'}</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedMyLeaves.map(r => {
                    const Icon = STATUS_ICONS[r.status]
                    return (
                      <div key={r.id} className="p-4 hover:bg-slate-50/50 transition-all space-y-2">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm">{r.applicantName}</span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-500">{r.applicantRole}</span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">{r.leaveType}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{new Date(r.startDate).toLocaleDateString()} → {new Date(r.endDate).toLocaleDateString()}</p>
                            <p className="text-xs text-slate-500">Submitted on {new Date(r.createdAt).toLocaleDateString()}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[r.status]}`}>
                            <Icon className="w-3.5 h-3.5" />{r.status}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                          <p className="text-slate-600">Reason: &ldquo;{r.reason}&rdquo;</p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {r.status === 'PENDING'
                              ? isAdmin
                                ? 'Awaiting your review.'
                                : 'Awaiting administrative decision.'
                              : r.status === 'APPROVED'
                                ? 'This request has been approved.'
                                : 'This request has been rejected.'}
                          </p>
                          {r.reviewedName && (
                            <p className="mt-1.5 text-indigo-700 flex items-center gap-1 border-t border-slate-200/50 pt-1.5">
                              <User className="w-3 h-3" /> {r.reviewedName}: &ldquo;{r.remarks || 'No remarks'}&rdquo;
                            </p>
                          )}
                          {!isAdmin && r.status === 'PENDING' && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                  if (confirm('Withdraw this pending leave request?')) {
                                    deleteMutation.mutate(r.id)
                                  }
                                }}
                              >
                                Withdraw Request
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
