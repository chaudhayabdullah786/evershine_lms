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
import { Badge } from '@/components/ui/badge'
import { notify } from '@/lib/notify'
import {
  ShieldAlert, CheckCircle, XCircle, Info, AlertTriangle,
  Filter, RotateCcw,
} from 'lucide-react'
import { ACADEMIC_RESOURCES } from '@/lib/admin/permission-manager'
import { DEFAULT_PERMISSION_MATRIX } from '@/lib/rbac'
import type { Role } from '@prisma/client'

// ── Resource metadata ─────────────────────────────────────────────────────────
// WHY: Non-technical admins need plain-English descriptions of what each
// resource controls. Tooltips reduce misconfiguration risk.
const RESOURCE_META: Record<string, { label: string; description: string; category: string }> = {
  students:              { label: 'Students',            description: 'Admission records, profiles, and enrollment status',     category: 'People'     },
  teachers:              { label: 'Teachers',            description: 'Staff profiles, designations, and class assignments',     category: 'People'     },
  users:                 { label: 'User Accounts',       description: 'Login credentials and system user management',           category: 'People'     },
  campuses:              { label: 'Campuses',            description: 'Branch locations, principal info, and activation',       category: 'Structure'  },
  batches:               { label: 'Batches',             description: 'Academic groupings (e.g. Matriculation 2026)',           category: 'Structure'  },
  classes:               { label: 'Classes',             description: 'Class levels, sections, and grade assignments',         category: 'Structure'  },
  houses:                { label: 'Houses',              description: 'Performance house assignments for students and teachers', category: 'Structure'  },
  academic_years:        { label: 'Academic Years',      description: 'Year creation, locking, and activation lifecycle',      category: 'Academic'   },
  class_sections:        { label: 'Class Sections',      description: 'Physical sections within a class (shift + campus)',     category: 'Academic'   },
  shifts:                { label: 'Shifts',              description: 'Morning / afternoon session schedules',                 category: 'Academic'   },
  subject_offerings:     { label: 'Subject Offerings',   description: 'Subjects assigned to class sections per year',          category: 'Academic'   },
  subject_enrollments:   { label: 'Subject Enrollments', description: 'Individual student subject selections (electives)',     category: 'Academic'   },
  promotions:            { label: 'Promotions',          description: 'End-of-year student grade promotion workflow',          category: 'Academic'   },
  timetable_engine:      { label: 'Timetable Engine',    description: 'Schedule builder, slot creation, and publishing',      category: 'Academic'   },
  grading_engine:        { label: 'Grading Engine',      description: 'Marks entry, grading schemes, and result calculation', category: 'Academic'   },
  exams:                 { label: 'Exams',               description: 'Exam schedules, types, and date management',           category: 'Academic'   },
  results:               { label: 'Results',             description: 'Published student results and report cards',           category: 'Academic'   },
  attendance:            { label: 'Attendance',          description: 'Daily student and teacher attendance records',         category: 'Operations' },
  fees:                  { label: 'Fee Records',         description: 'Challan generation, payment tracking, and dues',       category: 'Finance'    },
  fee_penalties:         { label: 'Fee Penalties',       description: 'Late payment penalty rules and application',           category: 'Finance'    },
  expenses:              { label: 'Expenses',            description: 'Campus operational expense recording',                 category: 'Finance'    },
  teacher_penalties:     { label: 'Teacher Penalties',   description: 'Deduction policies and enforcement for staff',        category: 'Finance'    },
  documents:             { label: 'Documents',           description: 'Official student ID cards and profile printouts',     category: 'Operations' },
  announcements:         { label: 'Announcements',       description: 'Broadcast notices to campus stakeholders',            category: 'Operations' },
  calendar:              { label: 'Calendar',            description: 'Academic events, holidays, and schedule items',       category: 'Operations' },
  audit_logs:            { label: 'Audit Logs',          description: 'System-level change history (read-only by design)',   category: 'System'     },
  dashboard:             { label: 'Dashboard',           description: 'Summary analytics and KPI overview',                  category: 'System'     },
}

const RESOURCE_LABEL = (resource: string) =>
  RESOURCE_META[resource]?.label ?? resource.replace(/_/g, ' ')

const CATEGORY_COLORS: Record<string, string> = {
  People:     'bg-blue-100 text-blue-800',
  Structure:  'bg-purple-100 text-purple-800',
  Academic:   'bg-indigo-100 text-indigo-800',
  Finance:    'bg-green-100 text-green-800',
  Operations: 'bg-amber-100 text-amber-800',
  System:     'bg-gray-100 text-gray-700',
}

// ── Constants ────────────────────────────────────────────────────────────────
const ROLE_OPTIONS: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'PARENT', 'GUARDIAN']
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
type PermissionsResponse = { matrix: PermissionMatrix; overrides: RolePermissionOverride[] }

// ── Component ────────────────────────────────────────────────────────────────
export default function PermissionsPage() {
  const { status, data: session } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role as Role | undefined
  const isAdminView = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'

  // Form state
  const [selectedRole, setSelectedRole] = useState<Role>('ADMIN')
  const [selectedResource, setSelectedResource] = useState<string>(ACADEMIC_RESOURCES[0] ?? '')
  const [selectedAction, setSelectedAction] = useState<string>(ACTION_OPTIONS[0])
  const [isEnabled, setIsEnabled] = useState(true)
  const [reason, setReason] = useState('')

  // Matrix filter state
  const [matrixRoleFilter, setMatrixRoleFilter] = useState<Role | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

  const permissionQuery = useQuery({
    queryKey: ['admin-permission-matrix'],
    queryFn: () => fetchApi<PermissionsResponse>('/api/admin/permissions'),
    enabled: isAdminView,
    staleTime: 60_000,
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: (overrideId: string) =>
      fetchApi('/api/admin/permissions', { method: 'DELETE', body: JSON.stringify({ id: overrideId }) }),
    onSuccess: () => {
      notify.success('Permission override removed.')
      queryClient.invalidateQueries({ queryKey: ['admin-permission-matrix'] })
    },
    onError: (err) => notify.error(err instanceof Error ? err.message : 'Unable to remove override.'),
  })

  const createOverrideMutation = useMutation({
    mutationFn: () => {
      if (!selectedResource || !selectedAction || !selectedRole) {
        throw new Error('Please select role, resource, and action.')
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
      notify.success('Permission override saved.')
      queryClient.invalidateQueries({ queryKey: ['admin-permission-matrix'] })
      setReason('')
    },
    onError: (err) => notify.error(err instanceof Error ? err.message : 'Unable to save override.'),
  })

  const sortedResources = useMemo(() => [...ACADEMIC_RESOURCES].sort(), [])
  const categories = useMemo(() => {
    const cats = new Set(sortedResources.map((r) => RESOURCE_META[r]?.category ?? 'Other'))
    return ['ALL', ...Array.from(cats).sort()]
  }, [sortedResources])

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

  // Compute which (role, resource, action) combos have an active DB override
  const overrideIndex = new Set(
    overrides.map((o) => `${o.role}|${o.resource}|${o.action}`)
  )

  // Roles to display in matrix (filtered)
  const matrixRoles = matrixRoleFilter === 'ALL'
    ? Object.keys(matrix) as Role[]
    : [matrixRoleFilter]

  // Resources to display (filtered by category)
  const filteredResources = sortedResources.filter((r) =>
    categoryFilter === 'ALL' || (RESOURCE_META[r]?.category ?? 'Other') === categoryFilter
  )

  return (
    <div className="space-y-8 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-4 w-4 text-slate-600" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">System Authorization</p>
        </div>
        <h1 className="text-2xl font-black text-slate-900">Permission Overrides</h1>
        <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
          Review the effective permission matrix for every role and create overrides that grant or revoke specific access without touching base code.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* ── Override form ───────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Create override</CardTitle>
            <CardDescription>
              Overrides layer on top of the base RBAC matrix. They are stored in the database and applied at runtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="permission-role">Target role</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
                  <SelectTrigger id="permission-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="permission-resource">Resource</Label>
                <Select value={selectedResource} onValueChange={setSelectedResource}>
                  <SelectTrigger id="permission-resource">
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedResources.map((r) => (
                      <SelectItem key={r} value={r}>
                        <span className="font-medium">{RESOURCE_LABEL(r)}</span>
                        {RESOURCE_META[r] && (
                          <span className="text-xs text-slate-400 ml-1">({RESOURCE_META[r].category})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedResource && RESOURCE_META[selectedResource] && (
                  <p className="text-xs text-slate-500 flex items-start gap-1 mt-1">
                    <Info className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                    {RESOURCE_META[selectedResource].description}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="permission-action">Action</Label>
                <Select value={selectedAction} onValueChange={setSelectedAction}>
                  <SelectTrigger id="permission-action">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Override type</Label>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEnabled(true)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      isEnabled ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEnabled(false)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      !isEnabled ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Disable
                  </button>
                </div>
              </div>
            </div>

            {/* Preview */}
            {selectedRole && selectedResource && selectedAction && (
              <div className={`rounded-xl p-3 text-xs font-medium flex items-center gap-2 ${
                isEnabled ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {isEnabled ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>
                  <strong>{selectedRole.replace('_', ' ')}</strong> will{' '}
                  {isEnabled ? 'gain' : 'lose'}{' '}
                  <strong>{selectedAction}</strong> access to{' '}
                  <strong>{RESOURCE_LABEL(selectedResource)}</strong>
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="permission-reason">Reason <span className="text-slate-400 text-xs">(optional)</span></Label>
              <Input
                id="permission-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why does this override exist? (audit trail)"
              />
            </div>

            {userRole === 'ADMIN' && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                Admins may modify all roles except <strong>SUPER_ADMIN</strong>.
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => createOverrideMutation.mutate()}
                disabled={createOverrideMutation.isPending}
              >
                {createOverrideMutation.isPending ? 'Saving…' : 'Save override'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Matrix view ─────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>Effective matrix</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Base permissions + active DB overrides. <span className="text-indigo-600 font-semibold">Highlighted rows</span> have active overrides.
                </CardDescription>
              </div>
              <button
                onClick={() => { setMatrixRoleFilter('ALL'); setCategoryFilter('ALL') }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={matrixRoleFilter} onValueChange={(v) => setMatrixRoleFilter(v as Role | 'ALL')}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <Filter className="w-3 h-3 mr-1 text-slate-400" />
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {permissionQuery.isLoading ? (
              <p className="text-sm text-slate-500 py-4">Fetching matrix…</p>
            ) : permissionQuery.isError ? (
              <p className="text-sm text-red-600">Unable to load matrix.</p>
            ) : (
              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                {matrixRoles.map((roleName) => {
                  const resources = matrix[roleName] ?? {}
                  const visibleResources = filteredResources.filter((r) => r in resources)
                  if (visibleResources.length === 0) return null

                  const activeCount = visibleResources.filter((r) =>
                    (resources[r]?.length ?? 0) > 0
                  ).length
                  const overrideCount = visibleResources.filter((r) =>
                    ACTION_OPTIONS.some((a) => overrideIndex.has(`${roleName}|${r}|${a}`))
                  ).length

                  return (
                    <div key={roleName} className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-slate-100">
                        <div>
                          <p className="text-sm font-black text-slate-900">{roleName.replace('_', ' ')}</p>
                          <p className="text-[10px] text-slate-400">{activeCount} resources active</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {overrideCount > 0 && (
                            <Badge className="text-[10px] bg-indigo-100 text-indigo-800 border-0 font-bold">
                              {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {visibleResources.length} resources
                          </Badge>
                        </div>
                      </div>
                      <div className="grid gap-2 p-3 sm:grid-cols-2">
                        {visibleResources.map((resource) => {
                          const actions: string[] = resources[resource] ?? []
                          const hasOverride = ACTION_OPTIONS.some((a) =>
                            overrideIndex.has(`${roleName}|${resource}|${a}`)
                          )
                          const category = RESOURCE_META[resource]?.category ?? 'Other'
                          const desc = RESOURCE_META[resource]?.description

                          return (
                            <div
                              key={resource}
                              className={`rounded-xl border p-3 transition-colors ${
                                hasOverride
                                  ? 'border-indigo-300 bg-indigo-50/60'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1.5">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate">
                                    {RESOURCE_LABEL(resource)}
                                  </p>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${CATEGORY_COLORS[category]}`}>
                                    {category}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {hasOverride && (
                                    <span className="text-[9px] text-indigo-600 font-black">OVERRIDE</span>
                                  )}
                                  {actions.length > 0 ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                  )}
                                </div>
                              </div>
                              {desc && (
                                <p className="text-[10px] text-slate-400 mb-1.5 leading-relaxed">{desc}</p>
                              )}
                              <p className="text-[11px] text-slate-600 font-medium">
                                {actions.length > 0 ? actions.join(', ') : 'No access'}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Active overrides table ───────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Active overrides</CardTitle>
              <CardDescription>
                Override records stored in the database. Revoking restores the base matrix default.
              </CardDescription>
            </div>
            {overrides.length > 0 && (
              <Badge className="bg-indigo-100 text-indigo-800 border-0 font-bold text-xs">
                {overrides.length} active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {permissionQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading overrides…</p>
          ) : overrides.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500 font-medium">No active permission overrides</p>
              <p className="text-xs text-slate-400 mt-1">All roles are operating on their base RBAC matrix.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-[0.15em] text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-3 font-black">Role</th>
                    <th className="px-4 py-3 font-black">Resource</th>
                    <th className="px-4 py-3 font-black">Action</th>
                    <th className="px-4 py-3 font-black">State</th>
                    <th className="px-4 py-3 font-black">Reason</th>
                    <th className="px-4 py-3 font-black">Created</th>
                    <th className="px-4 py-3 font-black">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overrides.map((override) => (
                    <tr key={override.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 text-xs">{override.role.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{RESOURCE_LABEL(override.resource)}</p>
                          {RESOURCE_META[override.resource] && (
                            <p className="text-[10px] text-slate-400">{RESOURCE_META[override.resource].category}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs font-mono">{override.action}</td>
                      <td className="px-4 py-3">
                        {override.isEnabled ? (
                          <Badge className="bg-green-100 text-green-800 border-0 text-[10px] font-bold">Enabled</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 border-0 text-[10px] font-bold">Disabled</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">
                        {override.reason ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(override.createdAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
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
