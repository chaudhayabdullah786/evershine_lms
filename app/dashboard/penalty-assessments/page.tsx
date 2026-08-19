'use client'

import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'
import { Loader2, ShieldCheck } from 'lucide-react'

type Assessment = {
  id: string
  type: string
  status: string
  amount: number | string
  reason: string
  createdAt: string
  student?: { firstName: string; lastName: string; registrationNumber: string | null } | null
  teacher?: { firstName: string; lastName: string; employeeId: string | null } | null
}

const statusActions = [
  { action: 'APPROVE', label: 'Approve' },
  { action: 'WAIVE', label: 'Waive' },
  { action: 'REJECT', label: 'Reject' },
] as const

export default function PenaltyAssessmentsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const qc = useQueryClient()
  const role = session?.user?.role
  const allowed = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'ACCOUNTANT'
  const { data, isLoading } = useQuery({
    queryKey: ['penalty-assessments'],
    queryFn: () => fetchApi<Assessment[]>('/api/penalty-assessments?status=PENDING'),
    enabled: allowed,
  })
  const { data: approved } = useQuery({
    queryKey: ['penalty-assessments-approved'],
    queryFn: () => fetchApi<Assessment[]>('/api/penalty-assessments?status=APPROVED'),
    enabled: allowed,
  })
  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => fetchApi(`/api/penalty-assessments/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
    onSuccess: () => { notify.success('Assessment updated'); qc.invalidateQueries({ queryKey: ['penalty-assessments'] }); qc.invalidateQueries({ queryKey: ['penalty-assessments-approved'] }) },
    onError: (error: Error) => notify.error(error.message),
  })

  if (sessionStatus === 'loading') return null
  if (!allowed) return <AccessDenied title="Penalty assessments" message="Only authorized finance users can review attendance assessments." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><ShieldCheck className="h-7 w-7 text-amber-600" />Penalty assessments</h1>
        <p className="mt-1 text-sm text-gray-500">Review attendance-based assessments before they affect a fee invoice or salary slip.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Pending review</CardTitle><CardDescription>Posting is transactional and idempotent. Student assessments require an open invoice; staff assessments require an unpaid salary slip.</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !data?.length ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">No pending assessments.</p> : (
            <div className="space-y-3">
              {data.map((item) => {
                const subject = item.student ? `${item.student.firstName} ${item.student.lastName}` : item.teacher ? `${item.teacher.firstName} ${item.teacher.lastName}` : 'Unknown'
                return <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                  <div><p className="font-semibold">{subject} · Rs {Number(item.amount).toLocaleString()}</p><p className="text-sm text-gray-600">{item.type.replace(/_/g, ' ')} — {item.reason}</p><p className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</p></div>
                  <div className="flex flex-wrap gap-2">{statusActions.map((entry) => <Button key={entry.action} size="sm" variant={entry.action === 'REJECT' ? 'outline' : 'default'} disabled={action.isPending} onClick={() => action.mutate({ id: item.id, action: entry.action })}>{entry.label}</Button>)}</div>
                </div>
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Approved and ready to post</CardTitle><CardDescription>Posting adds a fee line to the next open invoice or a deduction line to the teacher&apos;s unpaid salary slip.</CardDescription></CardHeader>
        <CardContent>
          {!approved?.length ? <p className="text-sm text-gray-500">No approved assessments are waiting to be posted.</p> : <div className="space-y-3">{approved.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{item.student ? `${item.student.firstName} ${item.student.lastName}` : item.teacher ? `${item.teacher.firstName} ${item.teacher.lastName}` : 'Unknown'} · Rs {Number(item.amount).toLocaleString()}</p><p className="text-sm text-gray-600">{item.type.replace(/_/g, ' ')} — {item.reason}</p></div><Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ id: item.id, action: 'POST' })}>Post financially</Button></div>)}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
