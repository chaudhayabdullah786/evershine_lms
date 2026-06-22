'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccessDenied } from '@/components/AccessDenied'
import { notify } from '@/lib/notify'
import { Scale, Loader2 } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type FeePolicy = {
  id: string
  isActive?: boolean
  graceDays: number
  penaltyType: string
  penaltyValue: number
  maxPenalty: number | null
  allowedLeavesPerMonth: number
  leavePenaltyAmount: number | string
  campus?: { name: string } | null
  batch?: { name: string } | null
}

type TeacherPolicy = {
  id: string
  isActive?: boolean
  lateThreshold: number
  penaltyType: string
  penaltyValue: number
  repeatMultiplier: number | null
  allowedLeavesPerMonth: number
  leavePenaltyAmount: number | string
  campus?: { name: string } | null
}

export default function PoliciesPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()
  const role = session?.user?.role
  const allowed = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const [feeForm, setFeeForm] = useState({
    campusId: '',
    batchId: '',
    graceDays: 7,
    penaltyType: 'FIXED' as 'FIXED' | 'PERCENTAGE',
    penaltyValue: 500,
    maxPenalty: '',
    // Leave penalty configuration (enforced on leave approval)
    allowedLeavesPerMonth: 1,
    leavePenaltyAmount: 200,
  })

  const [teacherForm, setTeacherForm] = useState({
    campusId: '',
    lateThreshold: 3,
    penaltyType: 'FIXED' as 'FIXED' | 'PERCENTAGE',
    penaltyValue: 200,
    repeatMultiplier: '2',
    // Leave penalty configuration (enforced on leave approval)
    allowedLeavesPerMonth: 1,
    leavePenaltyAmount: 500,
  })

  const { data: feePolicies, isLoading: loadingFee } = useQuery({
    queryKey: ['fee-policies'],
    queryFn: () => fetchApi<FeePolicy[]>('/api/fee-penalties'),
    enabled: allowed,
  })

  const { data: teacherPolicies, isLoading: loadingTeacher } = useQuery({
    queryKey: ['teacher-policies'],
    queryFn: () => fetchApi<TeacherPolicy[]>('/api/teacher-penalties'),
    enabled: allowed,
  })

  const { data: campuses } = useQuery({
    queryKey: ['campuses-policies'],
    queryFn: () => fetchApi<Array<{ id: string; name: string }>>('/api/campuses'),
    enabled: allowed,
  })

  const { data: batches } = useQuery({
    queryKey: ['batches-policies', feeForm.campusId],
    queryFn: () => fetchApi<Array<{ id: string; name: string }>>(`/api/batches?campusId=${feeForm.campusId}`),
    enabled: allowed && !!feeForm.campusId,
  })

  const createFee = useMutation({
    mutationFn: () =>
      fetchApi('/api/fee-penalties', {
        method: 'POST',
        body: JSON.stringify({
          campusId: feeForm.campusId || null,
          batchId: feeForm.batchId || null,
          graceDays: feeForm.graceDays,
          penaltyType: feeForm.penaltyType,
          penaltyValue: feeForm.penaltyValue,
          maxPenalty: feeForm.maxPenalty ? Number(feeForm.maxPenalty) : null,
          allowedLeavesPerMonth: feeForm.allowedLeavesPerMonth,
          leavePenaltyAmount: feeForm.leavePenaltyAmount,
        }),
      }),
    onSuccess: () => {
      notify.success('Fee penalty policy created')
      qc.invalidateQueries({ queryKey: ['fee-policies'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deactivateFee = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/fee-penalties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      }),
    onSuccess: () => {
      notify.success('Fee policy deactivated')
      qc.invalidateQueries({ queryKey: ['fee-policies'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deactivateTeacher = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/teacher-penalties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      }),
    onSuccess: () => {
      notify.success('Teacher policy deactivated')
      qc.invalidateQueries({ queryKey: ['teacher-policies'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const createTeacher = useMutation({
    mutationFn: () =>
      fetchApi('/api/teacher-penalties', {
        method: 'POST',
        body: JSON.stringify({
          campusId: teacherForm.campusId || null,
          lateThreshold: teacherForm.lateThreshold,
          penaltyType: teacherForm.penaltyType,
          penaltyValue: teacherForm.penaltyValue,
          repeatMultiplier: teacherForm.repeatMultiplier
            ? Number(teacherForm.repeatMultiplier)
            : null,
          allowedLeavesPerMonth: teacherForm.allowedLeavesPerMonth,
          leavePenaltyAmount: teacherForm.leavePenaltyAmount,
        }),
      }),
    onSuccess: () => {
      notify.success('Teacher lateness policy created')
      qc.invalidateQueries({ queryKey: ['teacher-policies'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (status === 'loading') return null
  if (!allowed) {
    return (
      <AccessDenied
        title="Penalty policies"
        message="Administrators configure fee and teacher lateness policies here."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Scale className="w-7 h-7 text-amber-600" />
          Penalty Policies
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure automated fee late penalties and teacher check-in lateness rules. Crons apply these daily.
        </p>
      </div>

      <Tabs defaultValue="fees">
        <TabsList>
          <TabsTrigger value="fees">Fee late penalties</TabsTrigger>
          <TabsTrigger value="teachers">Teacher lateness</TabsTrigger>
        </TabsList>

        <TabsContent value="fees" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New fee policy</CardTitle>
                <CardDescription>
                  Leave campus/batch empty for global default. Cron: <code className="text-xs">/api/cron/fee-penalties</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Campus (optional)</Label>
                  <Select
                    value={feeForm.campusId || 'global'}
                    onValueChange={(v) =>
                      setFeeForm({ ...feeForm, campusId: v === 'global' ? '' : v, batchId: '' })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">All campuses</SelectItem>
                      {(campuses ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {feeForm.campusId && (
                  <div>
                    <Label>Batch (optional)</Label>
                    <Select
                      value={feeForm.batchId || 'all'}
                      onValueChange={(v) => setFeeForm({ ...feeForm, batchId: v === 'all' ? '' : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All batches</SelectItem>
                        {(batches ?? []).map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Grace days after due date</Label><Input type="number" value={feeForm.graceDays} onChange={(e) => setFeeForm({ ...feeForm, graceDays: Number(e.target.value) })} /></div>
                <div>
                  <Label>Penalty type</Label>
                  <Select value={feeForm.penaltyType} onValueChange={(v) => setFeeForm({ ...feeForm, penaltyType: v as 'FIXED' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed (Rs)</SelectItem>
                      <SelectItem value="PERCENTAGE">Percentage of balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Penalty value</Label><Input type="number" value={feeForm.penaltyValue} onChange={(e) => setFeeForm({ ...feeForm, penaltyValue: Number(e.target.value) })} /></div>
                <div><Label>Max penalty cap (optional)</Label><Input value={feeForm.maxPenalty} onChange={(e) => setFeeForm({ ...feeForm, maxPenalty: e.target.value })} placeholder="e.g. 5000" /></div>
                <div className="border-t border-indigo-100 pt-3 mt-1">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Leave Penalty Configuration</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-indigo-700">Allowed Leaves/Month</Label>
                      <Input type="number" min={0} value={feeForm.allowedLeavesPerMonth}
                        onChange={(e) => setFeeForm({ ...feeForm, allowedLeavesPerMonth: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-indigo-700">Leave Penalty (Rs)</Label>
                      <Input type="number" min={0} value={feeForm.leavePenaltyAmount}
                        onChange={(e) => setFeeForm({ ...feeForm, leavePenaltyAmount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <p className="text-xs text-indigo-500 mt-1.5">Applied to the next fee invoice when approved leaves exceed the monthly limit. Emergency &amp; Sick leaves are always exempt.</p>
                </div>
                <Button onClick={() => createFee.mutate()} disabled={createFee.isPending}>
                  {createFee.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save fee policy'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Active policies</CardTitle></CardHeader>
              <CardContent>
                {loadingFee ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : (feePolicies ?? []).length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    No policies yet. Create one before the fee penalty cron runs.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scope</TableHead>
                        <TableHead>Grace</TableHead>
                        <TableHead>Late Fee Penalty</TableHead>
                        <TableHead>Leave Allowance</TableHead>
                        <TableHead>Leave Penalty</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feePolicies!.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">
                            {p.campus?.name ?? 'Global'}
                            {p.batch ? ` · ${p.batch.name}` : ''}
                          </TableCell>
                          <TableCell>{p.graceDays}d</TableCell>
                          <TableCell>
                            {p.penaltyType === 'FIXED' ? `Rs ${p.penaltyValue}` : `${p.penaltyValue}%`}
                            {p.maxPenalty != null ? ` (max ${p.maxPenalty})` : ''}
                          </TableCell>
                          <TableCell className="text-indigo-700 font-semibold">{p.allowedLeavesPerMonth ?? 1}/mo</TableCell>
                          <TableCell className="text-red-600 font-semibold">Rs {Number(p.leavePenaltyAmount ?? 0).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deactivateFee.isPending}
                              onClick={() => {
                                if (confirm('Deactivate this fee policy?')) deactivateFee.mutate(p.id)
                              }}
                            >
                              Deactivate
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="teachers" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Teacher lateness policy</CardTitle>
                <CardDescription>
                  Applied on HR check-in. Cron marks absent if no check-in: <code className="text-xs">/api/cron/teacher-attendance</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Campus (optional)</Label>
                  <Select
                    value={teacherForm.campusId || 'global'}
                    onValueChange={(v) => setTeacherForm({ ...teacherForm, campusId: v === 'global' ? '' : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">All campuses</SelectItem>
                      {(campuses ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Late count before multiplier</Label><Input type="number" min={1} value={teacherForm.lateThreshold} onChange={(e) => setTeacherForm({ ...teacherForm, lateThreshold: Number(e.target.value) })} /></div>
                <div>
                  <Label>Penalty type</Label>
                  <Select value={teacherForm.penaltyType} onValueChange={(v) => setTeacherForm({ ...teacherForm, penaltyType: v as 'FIXED' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed (Rs)</SelectItem>
                      <SelectItem value="PERCENTAGE">% of monthly salary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Penalty value</Label><Input type="number" value={teacherForm.penaltyValue} onChange={(e) => setTeacherForm({ ...teacherForm, penaltyValue: Number(e.target.value) })} /></div>
                <div><Label>Repeat multiplier (optional)</Label><Input value={teacherForm.repeatMultiplier} onChange={(e) => setTeacherForm({ ...teacherForm, repeatMultiplier: e.target.value })} placeholder="e.g. 2" /></div>
                <div className="border-t border-emerald-100 pt-3 mt-1">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Leave Penalty Configuration</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-emerald-700">Allowed Leaves/Month</Label>
                      <Input type="number" min={0} value={teacherForm.allowedLeavesPerMonth}
                        onChange={(e) => setTeacherForm({ ...teacherForm, allowedLeavesPerMonth: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-emerald-700">Leave Deduction (Rs)</Label>
                      <Input type="number" min={0} value={teacherForm.leavePenaltyAmount}
                        onChange={(e) => setTeacherForm({ ...teacherForm, leavePenaltyAmount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1.5">Salary deduction notice sent when approved leaves exceed limit. Emergency &amp; Sick leaves are always exempt.</p>
                </div>
                <Button onClick={() => createTeacher.mutate()} disabled={createTeacher.isPending}>
                  {createTeacher.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save teacher policy'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Active policies</CardTitle></CardHeader>
              <CardContent>
                {loadingTeacher ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : (teacherPolicies ?? []).length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    No policies yet. Teachers can still check in; penalties apply once configured.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campus</TableHead>
                        <TableHead>Lateness Rule</TableHead>
                        <TableHead>Leave Allowance</TableHead>
                        <TableHead>Leave Deduction</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teacherPolicies!.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.campus?.name ?? 'Global'}</TableCell>
                          <TableCell className="text-sm">
                            After {p.lateThreshold} lates/mo:{' '}
                            {p.penaltyType === 'FIXED' ? `Rs ${p.penaltyValue}` : `${p.penaltyValue}% salary`}
                            {p.repeatMultiplier ? ` ×${p.repeatMultiplier}` : ''}
                          </TableCell>
                          <TableCell className="text-emerald-700 font-semibold">{p.allowedLeavesPerMonth ?? 1}/mo</TableCell>
                          <TableCell className="text-red-600 font-semibold">Rs {Number(p.leavePenaltyAmount ?? 0).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deactivateTeacher.isPending}
                              onClick={() => {
                                if (confirm('Deactivate this teacher policy?')) deactivateTeacher.mutate(p.id)
                              }}
                            >
                              Deactivate
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
