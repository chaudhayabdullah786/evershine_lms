'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { ShieldCheck, UserCheck } from 'lucide-react'
import type { Role } from '@prisma/client'

const ASSUMABLE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'ACCOUNTANT', 'GUARDIAN']

interface RoleAssumption {
  id: string
  requesterId: string
  originalRole: Role
  assumedRole: Role
  reason: string | null
  expiresAt: string | null
  createdAt: string
}

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function RoleAssumptionsPage() {
  const { status, data: session } = useSession()
  const queryClient = useQueryClient()
  const currentRole = session?.user?.role as Role | undefined
  const isAdminView = currentRole === 'SUPER_ADMIN' || currentRole === 'ADMIN'

  const [assumedRole, setAssumedRole] = useState<Role>('TEACHER')
  const [expiresAt, setExpiresAt] = useState('')
  const [reason, setReason] = useState('')

  const assumptionsQuery = useQuery({
    queryKey: ['admin-role-assumptions'],
    queryFn: async () => {
      const data = await fetchApi<{ assumptions: RoleAssumption[] }>('/api/admin/role-assumptions')
      return data.assumptions
    },
    enabled: isAdminView,
    staleTime: 30_000,
  })

  const assumeRoleMutation = useMutation({
    mutationFn: async () => {
      if (!assumedRole) throw new Error('Select a role to assume.')
      const payload: Record<string, unknown> = {
        assumedRole,
      }
      if (reason.trim()) payload.reason = reason.trim()
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString()

      return fetchApi('/api/admin/role-assumptions', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      notify.success('Role assumption created.')
      setReason('')
      setExpiresAt('')
      queryClient.invalidateQueries({ queryKey: ['admin-role-assumptions'] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : 'Unable to create role assumption.')
    },
  })

  const revokeAssumptionMutation = useMutation({
    mutationFn: async (assumptionId: string) => {
      return fetchApi('/api/admin/role-assumptions', {
        method: 'DELETE',
        body: JSON.stringify({ id: assumptionId }),
      })
    },
    onSuccess: () => {
      notify.success('Role assumption revoked.')
      queryClient.invalidateQueries({ queryKey: ['admin-role-assumptions'] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : 'Unable to revoke role assumption.')
    },
  })

  const assumptions = assumptionsQuery.data ?? []

  if (status === 'loading') return null
  if (!isAdminView) {
    return (
      <AccessDenied
        title="Role Assumptions"
        message="Only Administrators may create temporary role assumptions."
      />
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-2 mb-1 text-slate-700">
          <ShieldCheck className="h-4 w-4 text-slate-700" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Support Mode</p>
        </div>
        <h1 className="text-2xl font-black text-slate-900">Role Assumption</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-2xl">
          Assume a temporary role for troubleshooting or support workflows. All assumptions are audited and expire when no longer needed.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Create new assumption</CardTitle>
            <CardDescription>
              The assumed role applies to your next session request and is tracked for compliance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assumed-role">Assumed role</Label>
                <Select value={assumedRole} onValueChange={(value) => setAssumedRole(value as Role)}>
                  <SelectTrigger id="assumed-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSUMABLE_ROLES.filter((role) => role !== currentRole).map((role) => (
                      <SelectItem key={role} value={role}>{role.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assumption-expires-at">Expires at</Label>
                <Input
                  id="assumption-expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
                <p className="text-xs text-slate-400">Optional. If left empty, the assumption remains active until revoked by your administrator workflow.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assumption-reason">Reason</Label>
                <Input
                  id="assumption-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why are you assuming this role?"
                />
                <p className="text-xs text-slate-400">Optional audit note for compliance reviewers.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                <p>
                  Current role: <strong>{currentRole?.replace('_', ' ')}</strong>
                </p>
              </div>
              <Button
                onClick={() => assumeRoleMutation.mutate()}
                disabled={assumeRoleMutation.isPending}
              >
                {assumeRoleMutation.isPending ? 'Requesting…' : 'Create assumption'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Active assumptions</CardTitle>
            <CardDescription>
              All active assumptions are visible here and recorded in the audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assumptionsQuery.isLoading ? (
              <div className="text-sm text-slate-500">Loading active assumptions…</div>
            ) : assumptions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                No active role assumptions exist for your account.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                  <UserCheck className="h-4 w-4" />
                  <p className="text-sm">Active assumptions expire automatically when the selected date passes or when revoked.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                        <th className="px-4 py-3">Assumed role</th>
                        <th className="px-4 py-3">Original role</th>
                        <th className="px-4 py-3">Expires</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Created</th>
                        <th className="px-4 py-3">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assumptions.map((item) => (
                        <tr key={item.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{item.assumedRole.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-slate-700">{item.originalRole.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-slate-700">{formatDate(item.expiresAt)}</td>
                          <td className="px-4 py-3 text-slate-700">{item.reason ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{formatDate(item.createdAt)}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => revokeAssumptionMutation.mutate(item.id)}
                              disabled={revokeAssumptionMutation.isPending}
                            >
                              Revoke
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
