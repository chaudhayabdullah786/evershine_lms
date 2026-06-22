'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { notify } from '@/lib/notify'
import {
  CheckCircle, XCircle, Clock, CalendarDays, User, MailQuestion
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

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
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'

  const [reviewDialog, setReviewDialog] = useState<{ isOpen: boolean, leaveId: string | null, action: 'APPROVED' | 'REJECTED' | null }>({
    isOpen: false, leaveId: null, action: null
  })
  const [remarks, setRemarks] = useState('')

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['teacher-student-leaves'],
    queryFn: () => fetchApi<StudentLeave[]>('/api/teacher-portal/student-leaves'),
    enabled: isTeacher
  })

  const reviewMutation = useMutation({
    mutationFn: (data: { id: string, status: 'APPROVED' | 'REJECTED', remarks: string }) => 
      fetchApi(`/api/teacher-portal/student-leaves/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: data.status, remarks: data.remarks }),
      }),
    onSuccess: () => {
      notify.success('Leave request updated successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-student-leaves'] })
      setReviewDialog({ isOpen: false, leaveId: null, action: null })
      setRemarks('')
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to update leave request')
    }
  })

  const handleReview = () => {
    if (!reviewDialog.leaveId || !reviewDialog.action) return
    reviewMutation.mutate({
      id: reviewDialog.leaveId,
      status: reviewDialog.action,
      remarks
    })
  }

  if (!isTeacher) return <div className="p-8 text-center text-gray-500">Access Restricted</div>

  const pendingLeaves = leaves.filter(l => l.status === 'PENDING')
  const pastLeaves = leaves.filter(l => l.status !== 'PENDING')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Student Leaves</h1>
        <p className="text-gray-500">Review and manage leave applications from students in your homeroom class.</p>
      </div>

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

                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setReviewDialog({ isOpen: true, leaveId: leave.id, action: 'REJECTED' })}
                      >
                        <XCircle className="w-4 h-4 mr-2" /> Reject
                      </Button>
                      <Button 
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => setReviewDialog({ isOpen: true, leaveId: leave.id, action: 'APPROVED' })}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" /> Approve
                      </Button>
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
                        " {leave.remarks} "
                      </p>
                    )}
                  </div>
                  <div className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    leave.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {leave.status}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>

      <Dialog open={reviewDialog.isOpen} onOpenChange={(open) => !open && setReviewDialog({ isOpen: false, leaveId: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog.action === 'APPROVED' ? 'Approve Leave Request' : 'Reject Leave Request'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Optional Remarks for Student</Label>
              <Textarea 
                placeholder="E.g., Please ensure you catch up on missed assignments."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog({ isOpen: false, leaveId: null, action: null })}>
              Cancel
            </Button>
            <Button 
              className={reviewDialog.action === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              onClick={handleReview}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Saving...' : `Confirm ${reviewDialog.action === 'APPROVED' ? 'Approval' : 'Rejection'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
