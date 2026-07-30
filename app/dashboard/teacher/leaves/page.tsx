'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  CheckCircle, XCircle, Clock, CalendarDays, User, ShieldCheck
} from 'lucide-react'
import { useSession } from 'next-auth/react'

interface StudentLeave {
  id: string
  startDate: string
  endDate: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  remarks: string | null
  createdAt: string
  student: {
    id: string
    firstName: string
    lastName: string
    rollNumber: string | null
  }
  class: {
    name: string
    section: string
  }
}

export default function TeacherStudentLeavesPage() {
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['teacher-student-leaves'],
    queryFn: () => fetchApi<StudentLeave[]>('/api/teacher-portal/student-leaves'),
    enabled: isTeacher
  })

  if (!isTeacher) return <div className="p-8 text-center text-gray-500">Access Restricted</div>

  const pendingLeaves = leaves.filter(l => l.status === 'PENDING')
  const pastLeaves = leaves.filter(l => l.status !== 'PENDING')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Student Leaves</h1>
        <p className="text-gray-500">
          Review leave applications for assigned students. Approval decisions are handled by Admin and Super Admin.
        </p>
      </div>

      <Card className="border-indigo-100 bg-indigo-50/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-indigo-950">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            Teacher attendance guidance
          </CardTitle>
          <CardDescription className="text-indigo-900/80">
            Pending leave requests do not change attendance automatically. Mark attendance from the attendance module according to the final approved leave or holiday status shown by administration.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-indigo-950 sm:grid-cols-3">
          <div className="rounded-xl border border-indigo-100 bg-white/70 p-3">
            <p className="font-semibold">Pending</p>
            <p className="mt-1 text-xs text-indigo-900/75">Wait for admin review before treating it as approved leave.</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-white/70 p-3">
            <p className="font-semibold">Approved</p>
            <p className="mt-1 text-xs text-indigo-900/75">Use the approved status when recording attendance for the covered dates.</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-white/70 p-3">
            <p className="font-semibold">Holiday missing?</p>
            <p className="mt-1 text-xs text-indigo-900/75">Ask the admin office to publish or correct the holiday before final attendance review.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" /> Pending Requests ({pendingLeaves.length})
          </h2>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 border rounded-xl border-dashed">Loading...</div>
          ) : pendingLeaves.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed">
              <p className="text-sm text-gray-500">No pending leave requests.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingLeaves.map((leave) => (
                <Card key={leave.id} className="border-amber-200 shadow-sm overflow-hidden">
                  <div className="h-1 bg-amber-400 w-full" />
                  <div className="p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                          <User className="w-4 h-4 text-gray-400" />
                          {leave.student.firstName} {leave.student.lastName}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {leave.class.name} ({leave.class.section}) • Roll {leave.student.rollNumber || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-gray-400">Applied on</div>
                        <div className="font-medium text-gray-700">{new Date(leave.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm space-y-2">
                      <div className="flex items-center gap-2 text-indigo-700 font-medium">
                        <CalendarDays className="w-4 h-4" />
                        {new Date(leave.startDate).toLocaleDateString()} to {new Date(leave.endDate).toLocaleDateString()}
                      </div>
                      <div className="text-gray-700">
                        <span className="font-medium">Reason: </span>
                        {leave.reason}
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      Pending admin review. Teachers can review the request here; approval or rejection is restricted to Admin and Super Admin.
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 mt-8">Past History</h2>
          <Card>
            <div className="divide-y">
              {pastLeaves.length === 0 && !isLoading && (
                <div className="text-center py-8 text-sm text-gray-500">No past leave requests found.</div>
              )}
              {pastLeaves.map((leave) => (
                <div key={leave.id} className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {leave.student.firstName} {leave.student.lastName}
                      <span className="text-xs text-gray-500 font-normal ml-2">
                        {leave.class.name} ({leave.class.section})
                      </span>
                    </h3>
                    <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                    </div>
                    {leave.remarks && (
                      <p className="text-xs text-gray-500 mt-1.5 italic">
                        &ldquo;{leave.remarks}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
                    leave.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {leave.status === 'APPROVED' ? (
                      <CheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {leave.status}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
