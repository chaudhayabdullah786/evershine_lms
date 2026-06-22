'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, RefreshCw, Clock, Info } from 'lucide-react'
import { notify } from '@/lib/notify'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const STATUS_OPTIONS = [
  { value: 'PENDING',  label: 'Pending'  },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

type TimetableRequest = {
  id: string
  slotSource: 'legacy' | 'engine'
  reason: string
  // Snapshot (always set — preferred for display)
  originalSubject: string | null
  originalDay: number | null
  originalStart: string | null
  originalEnd: string | null
  originalClass: string | null
  // Proposed values
  newDayOfWeek: number | null
  newStartTime: string | null
  newEndTime: string | null
  newSubjectName: string | null
  status: RequestStatus
  adminReply: string | null
  reviewedAt: string | null
  createdAt: string
  teacher: { firstName: string; lastName: string }
  // Live slot data (may be null if slot was deleted)
  timetable?: {
    id: string
    subjectName: string
    dayOfWeek: number
    startTime: string
    endTime: string
    class: { name: string }
  } | null
  timetableSlot?: {
    id: string
    dayOfWeek: number
    startTime: string
    endTime: string
    subjectOffering?: { subject?: { name?: string } }
    classSection?: { className?: string; sectionName?: string }
  } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves display values from snapshot (preferred) or live relation as fallback.
 * WHY snapshot first: The underlying slot may have changed or been deleted since
 * the request was submitted. Snapshots ensure the admin always sees what the
 * teacher originally requested to change.
 */
function resolveDisplay(req: TimetableRequest) {
  const className = req.originalClass
    ?? req.timetable?.class?.name
    ?? (req.timetableSlot?.classSection
        ? `${req.timetableSlot.classSection.className ?? ''}${req.timetableSlot.classSection.sectionName ? ` - ${req.timetableSlot.classSection.sectionName}` : ''}`
        : 'N/A')

  const subject = req.originalSubject
    ?? req.timetable?.subjectName
    ?? req.timetableSlot?.subjectOffering?.subject?.name
    ?? 'N/A'

  const day = req.originalDay
    ?? req.timetable?.dayOfWeek
    ?? (req.timetableSlot ? req.timetableSlot.dayOfWeek - 1 : 0)

  const start = req.originalStart ?? req.timetable?.startTime ?? req.timetableSlot?.startTime ?? '—'
  const end   = req.originalEnd   ?? req.timetable?.endTime   ?? req.timetableSlot?.endTime   ?? '—'

  return { className, subject, day, start, end }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimetableRequestsReviewPage() {
  const [statusFilter, setStatusFilter] = useState<RequestStatus>('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<TimetableRequest | null>(null)
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [adminReply, setAdminReply] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['timetable-requests', statusFilter],
    queryFn: () =>
      fetchPaginatedApi<TimetableRequest>(
        `/api/teacher-portal/timetable-requests?status=${statusFilter}&limit=100`
      ),
  })

  const requests = data?.data ?? []

  const reviewMutation = useMutation({
    mutationFn: (payload: { requestId: string; action: 'APPROVE' | 'REJECT'; adminReply?: string }) =>
      fetchApi('/api/timetable/requests/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success(`Request ${actionType === 'APPROVE' ? 'approved' : 'rejected'} and teacher notified`)
      setSelectedRequest(null)
      setAdminReply('')
      queryClient.invalidateQueries({ queryKey: ['timetable-requests'] })
    },
    onError: (err: any) => {
      notify.error('Action failed', { description: err?.message ?? 'An unexpected error occurred' })
    },
  })

  const openReview = (request: TimetableRequest, action: 'APPROVE' | 'REJECT') => {
    setSelectedRequest(request)
    setActionType(action)
    setAdminReply('')
  }

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRequest) return
    if (actionType === 'REJECT' && !adminReply.trim()) {
      notify.error('Please provide a rejection reason so the teacher can understand and resubmit correctly.')
      return
    }
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      action: actionType,
      adminReply: adminReply.trim() || undefined,
    })
  }

  const statusBadge = (status: RequestStatus) => {
    if (status === 'PENDING')  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
    if (status === 'APPROVED') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>
    return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Timetable Change Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review teacher schedule adjustment requests and approve or reject with a note.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Label className="text-xs font-bold text-gray-500">Filter by status</Label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RequestStatus)}
            className="h-10 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Teacher</TableHead>
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Class</TableHead>
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Current Slot</TableHead>
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Requested Change</TableHead>
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Reason</TableHead>
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Source</TableHead>
                <TableHead className="font-black text-gray-600 text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="w-44 font-black text-gray-600 text-xs uppercase tracking-wide">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Info className="w-8 h-8" />
                      <p className="text-sm font-medium">No {statusFilter.toLowerCase()} requests</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((req) => {
                  const { className, subject, day, start, end } = resolveDisplay(req)
                  return (
                    <TableRow key={req.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="font-semibold text-sm text-gray-800">
                        {req.teacher.firstName} {req.teacher.lastName}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{className}</TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-gray-800">{subject}</div>
                        <div className="text-[11px] text-gray-500">{DAYS[day]} · {start}–{end}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-indigo-700">
                          {req.newSubjectName ?? subject}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {DAYS[req.newDayOfWeek ?? day]} · {req.newStartTime ?? start}–{req.newEndTime ?? end}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-gray-700 break-words">{req.reason}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={req.slotSource === 'engine' ? 'text-purple-700 border-purple-200 bg-purple-50' : 'text-gray-600 border-gray-200 bg-gray-50'}>
                          {req.slotSource === 'engine' ? 'Academic Engine' : 'Legacy'}
                        </Badge>
                      </TableCell>
                      <TableCell>{statusBadge(req.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={req.status !== 'PENDING'}
                            onClick={() => openReview(req, 'APPROVE')}
                            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 disabled:opacity-40"
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={req.status !== 'PENDING'}
                            onClick={() => openReview(req, 'REJECT')}
                            className="text-red-700 border-red-200 hover:bg-red-50 disabled:opacity-40"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                          </Button>
                        </div>
                        {req.adminReply && req.status !== 'PENDING' && (
                          <p className="text-[10px] text-gray-400 mt-1 max-w-[160px] truncate" title={req.adminReply}>
                            Note: {req.adminReply}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className={`font-black text-lg ${actionType === 'APPROVE' ? 'text-emerald-700' : 'text-red-700'}`}>
              {actionType === 'APPROVE' ? '✅ Approve Timetable Request' : '❌ Reject Timetable Request'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'APPROVE'
                ? 'Approving will apply the proposed changes and notify the teacher and affected students.'
                : 'Rejection will notify the teacher. Please provide a clear reason so they can resubmit.'}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (() => {
            const { className, subject, day, start, end } = resolveDisplay(selectedRequest)
            return (
              <form className="space-y-4" onSubmit={handleReviewSubmit}>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Teacher</p>
                      <p className="text-gray-800 font-semibold mt-0.5">{selectedRequest.teacher.firstName} {selectedRequest.teacher.lastName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Class</p>
                      <p className="text-gray-800 font-semibold mt-0.5">{className}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Current Slot</p>
                      <p className="text-gray-800 font-semibold mt-0.5">{subject}</p>
                      <p className="text-gray-500 text-xs">{DAYS[day]} · {start}–{end}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Requested Change</p>
                      <p className="text-indigo-800 font-semibold mt-0.5">{selectedRequest.newSubjectName ?? subject}</p>
                      <p className="text-indigo-500 text-xs">
                        {DAYS[selectedRequest.newDayOfWeek ?? day]} · {selectedRequest.newStartTime ?? start}–{selectedRequest.newEndTime ?? end}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Teacher's Reason</p>
                    <p className="text-gray-700 text-sm mt-0.5 italic">"{selectedRequest.reason}"</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="admin-reply" className="text-xs font-bold text-gray-600 mb-1.5 block">
                    {actionType === 'REJECT' ? 'Rejection Reason *' : 'Admin Note (optional)'}
                  </Label>
                  <Input
                    id="admin-reply"
                    value={adminReply}
                    onChange={(e) => setAdminReply(e.target.value)}
                    placeholder={actionType === 'REJECT'
                      ? 'Explain why this request cannot be accommodated...'
                      : 'Optional note for the teacher...'}
                    required={actionType === 'REJECT'}
                  />
                  {actionType === 'REJECT' && (
                    <p className="text-xs text-gray-400 mt-1">This will be sent to the teacher via notification.</p>
                  )}
                </div>

                <DialogFooter className="gap-2 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setSelectedRequest(null)}
                    disabled={reviewMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={reviewMutation.isPending}
                    className={actionType === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white gap-2'
                      : 'bg-red-600 hover:bg-red-700 text-white gap-2'}
                  >
                    {reviewMutation.isPending ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : actionType === 'APPROVE' ? (
                      <><CheckCircle className="w-4 h-4" /> Confirm Approval</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Confirm Rejection</>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
