'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AccessDenied } from '@/components/AccessDenied'
import { Users, ClipboardCheck, BarChart2, Calendar, CreditCard, Loader2, Download, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadReportCardForEnrollment } from '@/lib/academic/download-report-card'
import { notify } from '@/lib/notify'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import Link from 'next/link'
import { FeePaymentDialog } from '@/components/features/guardian/FeePaymentDialog'
import { Upload, Clock } from 'lucide-react'

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Child = {
  id: string
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber: string | null
  campus: { name: string }
  batch: { name: string } | null
}

type ChildAcademic = {
  student: Child
  activeYear: { name: string } | null
  enrollmentId: string | null
  enrollment: {
    rollNumber: string
    deliveryMode: string
    classSection: {
      className: string
      sectionName: string
      shift?: { code: string }
    }
    subjectEnrollments: Array<{
      subjectOffering: { subject: { name: string }; teacher?: { firstName: string; lastName: string } }
    }>
  } | null
  attendance: {
    summary: { present: number; absent: number; late: number; attendancePct: number | null }
    records: Array<{ attendanceDate: string; status: string }>
  }
  results: Array<{ subjectName: string; percentage: number; grade: string; isPassed: boolean }>
  overallPercentage: number | null
  timetable: Array<{
    dayOfWeek: number
    startTime: string
    endTime: string
    subjectOffering: { subject: { name: string } }
    teacher: { firstName: string; lastName: string }
  }>
  feeInvoices: Array<{
    id: string
    challanNumber: string
    month: string
    totalAmount: number
    paidAmount: number
    status: string
    dueDate: string
    penaltyAmount: number
    proofStatus: string | null
  }>
}

type ChildLeave = {
  id: string
  startDate: string
  endDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reason: string
  remarks: string | null
  createdAt: string
}

export default function MyChildrenPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()
  const [selectedChildId, setSelectedChildId] = useState('')
  const [downloadingCard, setDownloadingCard] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveType, setLeaveType] = useState('CASUAL')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  
  // Payment Proof Modal State
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<ChildAcademic['feeInvoices'][number] | null>(null)

  const role = session?.user?.role
  const allowed = role === 'PARENT' || role === 'GUARDIAN'

  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ['guardian-children'],
    queryFn: () => fetchApi<Child[]>('/api/guardian-portal/children'),
    enabled: allowed,
  })

  const childId = selectedChildId || children?.[0]?.id || ''

  const { data: childLeaves, isLoading: loadingChildLeaves } = useQuery({
    queryKey: ['guardian-child-leaves', childId],
    queryFn: () => fetchApi<ChildLeave[]>(`/api/guardian-portal/children/${childId}/leaves`),
    enabled: !!childId && allowed,
  })

  const { data: academic, isLoading: loadingAcademic } = useQuery({
    queryKey: ['guardian-child-academic', childId],
    queryFn: () => fetchApi<ChildAcademic>(`/api/guardian-portal/children/${childId}/academic`),
    enabled: !!childId && allowed,
  })

  const submitLeave = useMutation({
    mutationFn: (payload: { leaveType: string; startDate: string; endDate: string; reason: string }) =>
      fetchApi(`/api/guardian-portal/children/${childId}/leaves`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success('Leave application submitted successfully!')
      setShowLeaveForm(false)
      setLeaveType('CASUAL')
      setLeaveStart('')
      setLeaveEnd('')
      setLeaveReason('')
      qc.invalidateQueries({ queryKey: ['guardian-child-leaves', childId] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (status === 'loading') return null
  if (!allowed) {
    return (
      <AccessDenied
        title="My Children"
        message="Parents and guardians can monitor linked students' attendance, results, and fees here."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-7 h-7 text-emerald-600" />
          My Children
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          View attendance, published results, timetable, and fee status (read-only).
        </p>
      </div>

      {loadingChildren ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading children…
        </div>
      ) : (children ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-gray-600">
            No students are linked to your account. Please contact the school office to link your child.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <Select value={childId} onValueChange={setSelectedChildId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select child" />
                </SelectTrigger>
                <SelectContent>
                  {(children ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} · {c.registrationNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {loadingAcademic ? (
            <div className="flex items-center gap-2 text-gray-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading academic records…
            </div>
          ) : academic ? (
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="fees">Fees</TabsTrigger>
                <TabsTrigger value="leaves">Leaves</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {academic.student.firstName} {academic.student.lastName}
                    </CardTitle>
                    <CardDescription>
                      {academic.activeYear?.name ?? 'No active year'} · {academic.student.campus.name}
                      {academic.student.batch ? ` · ${academic.student.batch.name}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
                    {academic.enrollment ? (
                      <>
                        <div>
                          <p className="text-gray-500">Section</p>
                          <p className="font-semibold">
                            {academic.enrollment.classSection.className}-
                            {academic.enrollment.classSection.sectionName}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Shift · Mode</p>
                          <p className="font-semibold">
                            {academic.enrollment.classSection.shift?.code
                              ? SESSION_SHIFT_LABELS[
                                  academic.enrollment.classSection.shift.code as keyof typeof SESSION_SHIFT_LABELS
                                ]
                              : '—'}{' '}
                            · {academic.enrollment.deliveryMode}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500 sm:col-span-2">No enrollment for the active academic year.</p>
                    )}
                  </CardContent>
                </Card>

                {academic.timetable.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Timetable
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      {academic.timetable.map((t) => (
                        <div key={`${t.dayOfWeek}-${t.startTime}`} className="flex justify-between border-b py-1">
                          <span>
                            {DAY_NAMES[t.dayOfWeek]} {t.startTime}–{t.endTime}
                          </span>
                          <span>{t.subjectOffering.subject.name}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="attendance" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5 text-green-600" />
                      Attendance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-3 mb-4 text-center text-sm">
                      <div className="bg-green-50 rounded p-2">
                        <p className="font-bold text-green-700">{academic.attendance.summary.present}</p>
                        <p className="text-xs">Present</p>
                      </div>
                      <div className="bg-red-50 rounded p-2">
                        <p className="font-bold text-red-700">{academic.attendance.summary.absent}</p>
                        <p className="text-xs">Absent</p>
                      </div>
                      <div className="bg-yellow-50 rounded p-2">
                        <p className="font-bold text-yellow-700">{academic.attendance.summary.late}</p>
                        <p className="text-xs">Late</p>
                      </div>
                      <div className="bg-indigo-50 rounded p-2">
                        <p className="font-bold text-indigo-700">
                          {academic.attendance.summary.attendancePct != null
                            ? `${academic.attendance.summary.attendancePct}%`
                            : '—'}
                        </p>
                        <p className="text-xs">Rate</p>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto text-sm">
                      {academic.attendance.records.map((r, i) => (
                        <div key={i} className="flex justify-between py-1 border-b">
                          <span>{new Date(r.attendanceDate).toLocaleDateString('en-PK')}</span>
                          <Badge variant="outline">{r.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="results" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-purple-600" />
                      Published Results
                    </CardTitle>
                    {academic.enrollmentId && academic.results.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 w-fit"
                        disabled={downloadingCard}
                        onClick={async () => {
                          setDownloadingCard(true)
                          try {
                            await downloadReportCardForEnrollment(academic.enrollmentId!)
                            notify.success('Report card downloaded')
                          } catch (e) {
                            notify.error(e instanceof Error ? e.message : 'Download failed')
                          } finally {
                            setDownloadingCard(false)
                          }
                        }}
                      >
                        {downloadingCard ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Download report card (PDF)
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {academic.overallPercentage != null && (
                      <p className="font-semibold text-purple-800">
                        Overall average: {academic.overallPercentage}%
                      </p>
                    )}
                    {academic.results.length === 0 ? (
                      <p className="text-sm text-gray-500">No published results yet.</p>
                    ) : (
                      academic.results.map((r) => (
                        <div key={r.subjectName} className="flex justify-between border rounded p-3">
                          <span className="font-medium">{r.subjectName}</span>
                          <span>
                            {r.percentage}% · <Badge>{r.grade}</Badge>
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="fees" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-blue-600" />
                      Fee Challans
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {academic.feeInvoices.length === 0 ? (
                      <p className="text-gray-500">No fee records.</p>
                    ) : (
                      academic.feeInvoices.map((inv) => (
                        <div
                          key={inv.challanNumber}
                          className="flex flex-wrap justify-between items-center border rounded p-3 gap-2"
                        >
                          <div>
                            <p className="font-medium">{inv.month}</p>
                            <p className="text-xs text-gray-500">{inv.challanNumber}</p>
                          </div>
                          <div className="text-right">
                            <p>
                              Rs {Number(inv.paidAmount)} / {Number(inv.totalAmount)}
                            </p>
                            <Badge 
                              variant={
                                inv.status === 'PAID' ? 'success' : 
                                inv.status === 'OVERDUE' ? 'destructive' : 
                                inv.status === 'CANCELLED' ? 'secondary' : 'default'
                              }
                            >
                              {inv.status}
                            </Badge>
                            {Number(inv.penaltyAmount) > 0 && (
                              <p className="text-xs text-red-600">Penalty: Rs {inv.penaltyAmount}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Link
                              href={`/dashboard/fees/${inv.id}`}
                              className="text-xs text-blue-600 hover:underline text-center border border-blue-200 px-3 py-1 rounded"
                            >
                              View challan
                            </Link>
                            
                            {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                              inv.proofStatus === 'PENDING' ? (
                                <Badge variant="outline" className="flex items-center gap-1 text-[10px]">
                                  <Clock className="w-3 h-3" /> Awaiting Approval
                                </Badge>
                              ) : (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setSelectedInvoice(inv)
                                    setPaymentDialogOpen(true)
                                  }}
                                >
                                  <Upload className="w-3 h-3 mr-1" />
                                  Upload Proof
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="leaves" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-5 h-5 text-rose-600" /> Leave Requests
                      </CardTitle>
                      <CardDescription>
                        Track and apply for leave requests for your child.
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setShowLeaveForm(!showLeaveForm)}
                      className="gap-1.5 bg-rose-600 hover:bg-rose-700"
                    >
                      <Plus className="w-4 h-4" /> Apply for Leave
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Leave Application Form */}
                    {showLeaveForm && (
                      <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/50 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <h4 className="font-bold text-rose-800 text-sm">New Leave Application</h4>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Leave Type</label>
                            <select
                              value={leaveType}
                              onChange={(e) => setLeaveType(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                            >
                              <option value="CASUAL">Casual Leave</option>
                              <option value="SICK">Sick Leave</option>
                              <option value="EMERGENCY">Emergency</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
                            <input
                              type="date"
                              value={leaveStart}
                              onChange={(e) => setLeaveStart(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">End Date</label>
                            <input
                              type="date"
                              value={leaveEnd}
                              onChange={(e) => setLeaveEnd(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Reason</label>
                          <textarea
                            rows={3}
                            value={leaveReason}
                            onChange={(e) => setLeaveReason(e.target.value)}
                            placeholder="Please explain the reason for leave..."
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowLeaveForm(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-rose-600 hover:bg-rose-700"
                            disabled={submitLeave.isPending || !leaveStart || !leaveEnd || !leaveReason.trim()}
                            onClick={() => submitLeave.mutate({
                              leaveType,
                              startDate: leaveStart,
                              endDate: leaveEnd,
                              reason: leaveReason.trim(),
                            })}
                          >
                            {submitLeave.isPending ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Submitting...</>
                            ) : (
                              <><Send className="w-3 h-3" /> Submit Application</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Leave History */}
                    {loadingChildLeaves ? (
                      <div className="text-sm text-gray-500">Loading leave history…</div>
                    ) : !childLeaves || childLeaves.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">
                        No leave requests found. Click &quot;Apply for Leave&quot; to submit a new request.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {childLeaves.map((leave) => (
                          <div key={leave.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{new Date(leave.startDate).toLocaleDateString('en-PK')} — {new Date(leave.endDate).toLocaleDateString('en-PK')}</p>
                                <p className="text-sm text-slate-600">{leave.reason}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={leave.status === 'APPROVED' ? 'success' : leave.status === 'REJECTED' ? 'destructive' : 'outline'}>
                                  {leave.status}
                                </Badge>
                                <span className="text-xs text-slate-500">Applied {new Date(leave.createdAt).toLocaleDateString('en-PK')}</span>
                              </div>
                            </div>
                            {leave.remarks && (
                              <p className="mt-3 text-sm text-slate-500">Remarks: {leave.remarks}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}
        </>
      )}

      {/* Payment Upload Modal */}
      <FeePaymentDialog 
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        studentId={childId}
        invoice={selectedInvoice}
      />
    </div>
  )
}
