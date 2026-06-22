'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { notify } from '@/lib/notify'
import { Wallet, FileText, Send, Calendar, Clock, CheckCircle, XCircle, UserCheck, Loader2, AlertTriangle, ShieldCheck, ShieldAlert, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import type { SessionShift } from '@/lib/validation/shift'
import { useSession } from 'next-auth/react'

interface SalarySlip { id: string; month: string; netSalary: number; status: string; createdAt: string }
interface Application { id: string; title: string; description: string; type: string; status: string; createdAt: string; adminReply: string | null }

type ShiftInfo = {
  code: SessionShift; label: string; startTime: string; endTime: string; lateGraceMinutes: number
  today: { id: string; checkInTime: string; status: string; hrStatus: string | null; lateMinutes: number; penaltyAmount: number } | null
}
type MonthlyStats = { present: number; late: number; absent: number; leave: number; totalPenalty: number; gracePassesUsed: number; gracePassesAllowed: number }
type CheckInData = {
  teacher: { id: string; name: string }; defaultShift: string; shifts: ShiftInfo[]; monthlyStats: MonthlyStats
  history: Array<{ id: string; date: string; shift: string; status: string; hrStatus: string | null; lateMinutes: number; penaltyAmount: number; checkInTime: string | null; remarks: string | null }>
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  return (
    <div className="text-center">
      <p className="text-4xl font-mono font-bold tracking-wider text-slate-900">
        {time.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
      </p>
      <p className="text-sm text-slate-500 mt-1">
        {time.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}

function detectActiveShift(shifts: ShiftInfo[]): ShiftInfo | null {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  for (const s of shifts) {
    const [sh, sm] = s.startTime.split(':').map(Number)
    const [eh, em] = s.endTime.split(':').map(Number)
    const start = sh * 60 + sm
    const end = eh * 60 + em
    // Active if within shift window (± 60 min buffer before start)
    if (mins >= start - 60 && mins <= end) return s
  }
  // Fallback: next upcoming shift
  for (const s of shifts) {
    const [sh, sm] = s.startTime.split(':').map(Number)
    if (mins < sh * 60 + sm) return s
  }
  return shifts[0] ?? null
}

export default function TeacherHRPage() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'
  const [activeTab, setActiveTab] = useState<'checkin' | 'salary' | 'applications'>('checkin')
  const [isApplying, setIsApplying] = useState(false)
  const [formData, setFormData] = useState({ type: 'LEAVE', title: '', description: '' })

  const { data: checkInData, isLoading: isLoadingCheckIn, refetch: refetchCheckIn } = useQuery({
    queryKey: ['teacher-check-in'],
    queryFn: () => fetchApi<CheckInData>('/api/teacher-portal/check-in'),
    enabled: isTeacher && activeTab === 'checkin',
  })

  const checkInMutation = useMutation({
    mutationFn: (shift: SessionShift) =>
      fetchApi('/api/teacher-attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({ teacherId: checkInData!.teacher.id, shift }),
      }),
    onSuccess: (record: { lateMinutes?: number; penaltyAmount?: number; hrStatus?: string; gracePassUsed?: boolean }) => {
      const late = record.lateMinutes ?? 0
      const penalty = Number(record.penaltyAmount ?? 0)
      if (record.gracePassUsed) {
        notify.warning(`Checked in ${late} min late — monthly grace pass used. Next late arrival will incur a penalty.`)
      } else if (penalty > 0) {
        notify.error(`Checked in ${late} min late · Penalty: Rs ${penalty}`)
      } else {
        notify.success('Attendance marked — on time ✓')
      }
      refetchCheckIn()
    },
    onError: (err: Error) => notify.error(err.message || 'Check-in failed'),
  })

  const { data: salarySlips, isLoading: isLoadingSalary } = useQuery({
    queryKey: ['teacher-salary'],
    queryFn: () => fetchApi<SalarySlip[]>('/api/teacher-portal/salary'),
    enabled: isTeacher && activeTab === 'salary',
  })

  const { data: applications, isLoading: isLoadingApps } = useQuery({
    queryKey: ['teacher-applications'],
    queryFn: () => fetchApi<Application[]>('/api/teacher-portal/applications'),
    enabled: isTeacher && activeTab === 'applications',
  })

  const applyMutation = useMutation({
    mutationFn: (data: typeof formData) => fetchApi('/api/teacher-portal/applications', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { notify.success('Application submitted successfully'); queryClient.invalidateQueries({ queryKey: ['teacher-applications'] }); setIsApplying(false); setFormData({ type: 'LEAVE', title: '', description: '' }) },
    onError: (err: any) => notify.error(err.message || 'Failed to submit application'),
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); applyMutation.mutate(formData) }

  if (!isTeacher) return <div className="p-8 text-center text-gray-500">Access Restricted</div>

  const activeShift = checkInData ? detectActiveShift(checkInData.shifts) : null
  const stats = checkInData?.monthlyStats
  const graceRemaining = stats ? Math.max(0, stats.gracePassesAllowed - stats.gracePassesUsed) : 1

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">My HR Portal</h1>
        <p className="text-gray-500">View your salary slips and submit applications to administration.</p>
      </div>

      <div className="flex border-b border-gray-200 flex-wrap">
        {([['checkin', UserCheck, 'Attendance'], ['salary', Wallet, 'Salary Slips'], ['applications', FileText, 'My Applications']] as const).map(([key, Icon, label]) => (
          <button key={key} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`} onClick={() => setActiveTab(key as any)}>
            <span className="flex items-center gap-2"><Icon className="w-4 h-4" /> {label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ATTENDANCE TAB — Professional check-in with live clock
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'checkin' && (
        <div className="space-y-5">
          {isLoadingCheckIn ? (
            <div className="flex items-center gap-2 text-gray-500 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading attendance data…</div>
          ) : (
            <>
              {/* ── Main Attendance Card ───────────────────────────────── */}
              <Card className="border-slate-200 shadow-md overflow-hidden">
                <div className={`h-1.5 ${activeShift?.today ? (activeShift.today.hrStatus === 'LATE' ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-indigo-500'}`} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Timer className="w-5 h-5 text-indigo-600" />
                        Today&apos;s Attendance
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </CardDescription>
                    </div>
                    {activeShift && (
                      <Badge variant="outline" className="text-sm px-3 py-1 font-medium">
                        {SESSION_SHIFT_LABELS[activeShift.code]} · {activeShift.startTime} – {activeShift.endTime}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Live Clock + Check-in Button */}
                  <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-100 rounded-xl p-6 text-center space-y-5">
                    <LiveClock />

                    {activeShift?.today ? (
                      <div className="space-y-2">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${activeShift.today.hrStatus === 'LATE' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                          {activeShift.today.hrStatus === 'LATE' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          {activeShift.today.hrStatus === 'LATE' ? 'Checked in late' : 'Checked in on time'}
                          {' · '}
                          {new Date(activeShift.today.checkInTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                        {activeShift.today.lateMinutes > 0 && (
                          <p className="text-xs text-slate-500">
                            {activeShift.today.lateMinutes} min late
                            {activeShift.today.penaltyAmount > 0 ? ` · Penalty: Rs ${activeShift.today.penaltyAmount}` : ' · No penalty (grace pass)'}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-500">
                          {activeShift ? `Grace period: ${activeShift.lateGraceMinutes} minutes after shift start` : 'No shift detected'}
                        </p>
                        <Button
                          size="lg"
                          className="px-8 py-3 text-base font-semibold shadow-md"
                          disabled={!activeShift || checkInMutation.isPending || !checkInData?.teacher.id}
                          onClick={() => activeShift && checkInMutation.mutate(activeShift.code)}
                        >
                          {checkInMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <UserCheck className="w-5 h-5 mr-2" />}
                          Mark Attendance
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* All shifts quick view */}
                  <div className="grid sm:grid-cols-3 gap-3">
                    {(checkInData?.shifts ?? []).map((s) => (
                      <div key={s.code} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${s.today ? (s.today.hrStatus === 'LATE' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200') : 'bg-slate-50 border-slate-200'}`}>
                        <div>
                          <p className="font-medium text-slate-800">{SESSION_SHIFT_LABELS[s.code]}</p>
                          <p className="text-xs text-slate-500">{s.startTime} – {s.endTime}</p>
                        </div>
                        {s.today ? (
                          <Badge className={`text-xs ${s.today.hrStatus === 'LATE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {new Date(s.today.checkInTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ── Monthly Summary Strip ─────────────────────────────── */}
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{stats.present}</p>
                    <p className="text-xs text-emerald-600 font-medium mt-1">Present</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-amber-700">{stats.late}</p>
                    <p className="text-xs text-amber-600 font-medium mt-1">Late</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">{stats.absent}</p>
                    <p className="text-xs text-red-600 font-medium mt-1">Absent</p>
                  </div>
                  <div className={`border rounded-xl p-4 text-center ${graceRemaining > 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                    <p className="text-2xl font-bold flex items-center justify-center gap-1">
                      {graceRemaining > 0 ? <ShieldCheck className="w-5 h-5 text-blue-600" /> : <ShieldAlert className="w-5 h-5 text-orange-600" />}
                      <span className={graceRemaining > 0 ? 'text-blue-700' : 'text-orange-700'}>{graceRemaining}</span>
                    </p>
                    <p className={`text-xs font-medium mt-1 ${graceRemaining > 0 ? 'text-blue-600' : 'text-orange-600'}`}>Grace Left</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-slate-700">Rs {stats.totalPenalty}</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Total Penalty</p>
                  </div>
                </div>
              )}

              {/* ── Grace Policy Notice ───────────────────────────────── */}
              <div className={`flex items-start gap-3 p-4 rounded-lg border text-sm ${graceRemaining > 0 ? 'bg-blue-50/50 border-blue-100 text-blue-800' : 'bg-orange-50/50 border-orange-100 text-orange-800'}`}>
                {graceRemaining > 0 ? <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" /> : <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />}
                <div>
                  <p className="font-semibold">{graceRemaining > 0 ? 'Grace pass available' : 'Grace pass used'}</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    {graceRemaining > 0
                      ? 'You have 1 penalty-free late arrival allowed this month. Arrivals beyond 30 minutes after shift start are considered late.'
                      : 'Your monthly grace pass has been used. Any further late arrivals will incur penalty deductions from your salary.'}
                  </p>
                </div>
              </div>

              {/* ── Monthly History Table ─────────────────────────────── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">This Month&apos;s Log</CardTitle>
                </CardHeader>
                <CardContent>
                  {(checkInData?.history ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No attendance records this month.</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Shift</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Check-in</TableHead>
                            <TableHead>Late</TableHead>
                            <TableHead className="text-right">Penalty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checkInData!.history.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{new Date(r.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</TableCell>
                              <TableCell>{SESSION_SHIFT_LABELS[r.shift as SessionShift] ?? r.shift}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={
                                  r.hrStatus === 'PRESENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  r.hrStatus === 'LATE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  r.hrStatus === 'ABSENT' ? 'bg-red-50 text-red-700 border-red-200' :
                                  'bg-blue-50 text-blue-700 border-blue-200'
                                }>
                                  {r.hrStatus ?? r.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }) : r.remarks ?? '—'}
                              </TableCell>
                              <TableCell>{r.lateMinutes > 0 ? `${r.lateMinutes} min` : '—'}</TableCell>
                              <TableCell className="text-right">{r.penaltyAmount > 0 ? `Rs ${r.penaltyAmount}` : '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ═══════ SALARY TAB ═══════ */}
      {activeTab === 'salary' && (
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-4"><CardTitle className="text-lg">Salary History</CardTitle><CardDescription>View your monthly processed salary slips.</CardDescription></CardHeader>
          <CardContent>
            {isLoadingSalary ? (<div className="text-center py-8 text-gray-500">Loading salary data...</div>
            ) : !salarySlips?.length ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed"><Wallet className="w-8 h-8 text-gray-400 mx-auto mb-3" /><h3 className="text-sm font-medium text-gray-900">No salary slips generated</h3><p className="text-sm text-gray-500 mt-1">Your salary slips will appear here once processed by the accountant.</p></div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50"><TableRow><TableHead>Month</TableHead><TableHead>Generated On</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Net Salary</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {salarySlips?.map((slip) => (
                      <TableRow key={slip.id}>
                        <TableCell className="font-medium text-gray-900">{slip.month}</TableCell>
                        <TableCell className="text-sm text-gray-500">{new Date(slip.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${slip.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{slip.status}</span></TableCell>
                        <TableCell className="text-right font-medium text-gray-900">PKR {Number(slip.netSalary).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════ APPLICATIONS TAB ═══════ */}
      {activeTab === 'applications' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setIsApplying(!isApplying)} className="gap-2">
              {isApplying ? 'Cancel Application' : <><Send className="w-4 h-4" /> New Application</>}
            </Button>
          </div>
          {isApplying && (
            <Card className="border-indigo-100 shadow-sm">
              <CardHeader className="bg-indigo-50/50 pb-4"><CardTitle className="text-lg">Submit New Application</CardTitle><CardDescription>Submit leave requests, advance salary requests, or general applications to HR.</CardDescription></CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Application Type</Label>
                      <Select value={formData.type} onValueChange={(val) => setFormData(prev => ({ ...prev, type: val }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LEAVE">Leave Request</SelectItem>
                          <SelectItem value="ADVANCE_SALARY">Advance Salary Request</SelectItem>
                          <SelectItem value="PROGRESS_UPDATE">Course Progress Update</SelectItem>
                          <SelectItem value="OTHER">Other Query</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Subject / Title *</Label><Input required placeholder="e.g. Sick leave for 2 days" value={formData.title} onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>Details / Reason *</Label><Textarea required rows={4} placeholder="Provide detailed reasons for your application..." value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} /></div>
                  <div className="flex justify-end pt-2"><Button type="submit" disabled={applyMutation.isPending}>{applyMutation.isPending ? 'Submitting...' : 'Submit to Admin'}</Button></div>
                </form>
              </CardContent>
            </Card>
          )}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-4"><CardTitle className="text-lg">Previous Applications</CardTitle></CardHeader>
            <CardContent>
              {isLoadingApps ? (<div className="text-center py-8 text-gray-500">Loading applications...</div>
              ) : !applications?.length ? (<div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed text-sm text-gray-500">No applications found.</div>
              ) : (
                <div className="space-y-4">
                  {applications?.map((app) => (
                    <div key={app.id} className="p-4 border rounded-lg bg-white shadow-sm flex flex-col md:flex-row gap-4 justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700">{app.type.replace('_', ' ')}</span>
                          <span className={`text-xs font-medium flex items-center gap-1 ${app.status === 'APPROVED' ? 'text-green-600' : app.status === 'REJECTED' ? 'text-red-600' : 'text-yellow-600'}`}>
                            {app.status === 'APPROVED' ? <CheckCircle className="w-3.5 h-3.5" /> : app.status === 'REJECTED' ? <XCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {app.status}
                          </span>
                        </div>
                        <h3 className="font-semibold text-gray-900">{app.title}</h3>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{app.description}</p>
                        {app.adminReply && (<div className="mt-3 p-3 bg-gray-50 rounded-md border text-sm text-gray-800"><strong>Admin Reply:</strong> {app.adminReply}</div>)}
                      </div>
                      <div className="text-xs text-gray-400 md:text-right flex items-start gap-1 justify-end"><Calendar className="w-3.5 h-3.5" />{new Date(app.createdAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
