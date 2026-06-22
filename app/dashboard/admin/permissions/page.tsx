'use client'

import { useMemo, useState } from 'react'
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
import { ShieldAlert, CheckCircle, XCircle } from 'lucide-react'
import { ACADEMIC_RESOURCES } from '@/lib/admin/permission-manager'
import type { Role } from '@prisma/client'

const ROLE_OPTIONS: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'ACCOUNTANT', 'GUARDIAN']
const ACTION_OPTIONS = ['create', 'read', 'update', 'delete'] as const

type PermissionMatrix = Record<string, Record<string, string[]>>

interface RolePermissionOverride {
  id: string
  role: Role
  resource: string
  action: string
  isEnabled: boolean
  reason: string | null
  createdAt: string
}

type PermissionsResponse = {
  matrix: PermissionMatrix
  overrides: RolePermissionOverride[]
}

export default function PermissionsPage() {
  const { status, data: session } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role as Role | undefined
  const isAdminView = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'

  const [selectedRole, setSelectedRole] = useState<Role>('ADMIN')
  const [selectedResource, setSelectedResource] = useState<string>(ACADEMIC_RESOURCES[0] ?? '')
  const [selectedAction, setSelectedAction] = useState<string>(ACTION_OPTIONS[0])
  const [isEnabled, setIsEnabled] = useState(true)
  const [reason, setReason] = useState('')

  const permissionQuery = useQuery({
    queryKey: ['admin-permission-matrix'],
    queryFn: async () => {
      const data = await fetchApi<PermissionsResponse>('/api/admin/permissions')
      return data
    },
    enabled: isAdminView,
    staleTime: 60_000,
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      return fetchApi('/api/admin/permissions', {
        method: 'DELETE',
        body: JSON.stringify({ id: overrideId }),
      })
    },
    onSuccess: () => {
      notify.success('Permission override removed.')
      queryClient.invalidateQueries({ queryKey: ['admin-permission-matrix'] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : 'Unable to remove override.')
    },
  })

  const createOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!selectedResource || !selectedAction || !selectedRole) {
        throw new Error('Please select role, resource, and action to continue.')
      }

      return fetchApi('/api/admin/permissions', {
        method: 'POST',
        body: JSON.stringify({
          role: selectedRole,
          resource: selectedResource,
          action: selectedAction,
          isEnabled,
          reason: reason || undefined,
        }),
      })
    },
    onSuccess: () => {
      notify.success('Permission override saved successfully.')
      queryClient.invalidateQueries({ queryKey: ['admin-permission-matrix'] })
      setReason('')
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : 'Unable to save permission override.')
    },
  })

  const sortedResources = useMemo(() => [...ACADEMIC_RESOURCES].sort(), [])

  if (status === 'loading') return null
  if (!isAdminView) {
    return (
      <AccessDenied
        title="Permission Management"
        message="Only Administrators may view or configure permission overrides."
      />
    )
  }

  const matrix = permissionQuery.data?.matrix ?? {}
  const overrides = permissionQuery.data?.overrides ?? []

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-2 mb-1 text-slate-700">
          <ShieldAlert className="h-4 w-4 text-slate-700" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">System Authorization</p>
        </div>
        <h1 className="text-2xl font-black text-slate-900">Permission Overrides</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-2xl">
          Review the effective permission matrix for every role and create temporary overrides that add or revoke access for operational needs.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Actionable override</CardTitle>
            <CardDescription>
              Create a role-based permission override without changing the base RBAC matrix.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="permission-role">Target role</Label>
                <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as Role)}>
                  <SelectTrigger id="permission-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>{role.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="permission-resource">Resource</Label>
                <Select value={selectedResource} onValueChange={(value) => setSelectedResource(value)}>
                  <SelectTrigger id="permission-resource">
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedResources.map((resource) => (
                      <SelectItem key={resource} value={resource}>{resource.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="permission-action">Action</Label>
                <Select value={selectedAction} onValueChange={(value) => setSelectedAction(value)}>
                  <SelectTrigger id="permission-action">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((action) => (
                      <SelectItem key={action} value={action}>{action}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="permission-toggle">Override type</Label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEnabled(true)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${isEnabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEnabled(false)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${!isEnabled ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    Disable
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="permission-reason">Reason</Label>
              <Input
                id="permission-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why does this override exist?"
              />
              <p className="text-xs text-slate-400">Optional note for audit review. Up to 255 characters.</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                {userRole === 'ADMIN' ? (
                  <p>
                    Admins may modify all roles except <strong>SUPER_ADMIN</strong>.
                  </p>
                ) : (
                  <p>Super administrators may manage the entire system permission matrix.</p>
                )}
              </div>
              <Button
                onClick={() => createOverrideMutation.mutate()}
                disabled={createOverrideMutation.isPending}
              >
                {createOverrideMutation.isPending ? 'Saving…' : 'Save override'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Current matrix</CardTitle>
            <CardDescription>
              Effective permissions include base role access plus all active overrides.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {permissionQuery.isLoading ? (
              <p className="text-sm text-slate-500">Fetching matrix…</p>
            ) : permissionQuery.isError ? (
              <p className="text-sm text-red-600">Unable to load matrix.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(matrix).map(([roleName, resources]) => (
                  <div key={roleName} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="text-sm text-slate-500 uppercase tracking-[0.2em]">Role</p>
                        <p className="text-lg font-semibold text-slate-900">{roleName.replace('_', ' ')}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                        {Object.values(resources).filter((actions) => actions.length > 0).length} resources
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(resources).map(([resource, actions]) => (
                        <div key={resource} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{resource.replace(/_/g, ' ')}</p>
                            {actions.length > 0 ? (
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-500" />
                            )}
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            {actions.length > 0 ? actions.join(', ') : 'No access'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Active overrides</CardTitle>
          <CardDescription>
            Manage active permission override records created for support and operational use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissionQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading overrides…</p>
          ) : overrides.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              No active permission overrides exist.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((override) => (
                    <tr key={override.id} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{override.role.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-slate-700">{override.resource.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-slate-700">{override.action}</td>
                      <td className="px-4 py-3 text-slate-700">{override.isEnabled ? 'Enabled' : 'Disabled'}</td>
                      <td className="px-4 py-3 text-slate-700">{override.reason ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{new Date(override.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => deleteOverrideMutation.mutate(override.id)}
                          disabled={deleteOverrideMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
