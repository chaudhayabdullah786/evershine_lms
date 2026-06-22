'use client'

/**
 * /dashboard/admin/credential-management — Super Admin Credential Hub
 *
 * Capabilities:
 *  1. Create Account Manager (POST /api/users/create-accountant)
 *  2. Search all users across the system
 *  3. Reset email/password for any user (POST /api/users/reset-credentials)
 *
 * WHY separate from normal user CRUD:
 * Credential management is a highly sensitive security operation. Grouping it here
 * provides a strict SUPER_ADMIN barrier and a centralized audit trail focus.
 */

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { Search, ShieldAlert, KeyRound, UserPlus, Loader2, RefreshCw } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campus { id: string; name: string }

interface SystemUser {
  id: string
  email: string
  role: string
  isActive: boolean
  name: string
  lastLogin: string | null
  adminProfile?: { campusName: string; department: string } | null
  accountantProfile?: { campusName: string; employeeId: string; phoneNumber: string } | null
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CredentialManagementPage() {
  const { data: session, status } = useSession()
  const role = (session?.user?.role as string) || ''
  const isSuperAdmin = role === 'SUPER_ADMIN'

  if (status === 'loading') return null
  if (!isSuperAdmin) {
    return (
      <AccessDenied
        title="Credential Management"
        message="Only Super Administrators are authorized to manage system credentials."
      />
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-2 mb-1 text-red-600">
          <ShieldAlert className="h-4 w-4" />
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">Security Ops</p>
        </div>
        <h1 className="text-2xl font-black text-slate-900">Credential Management</h1>
        <p className="text-sm text-slate-500">
          Provision finance staff and reset credentials for any user in the system.
        </p>
      </div>

      <Tabs defaultValue="reset" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reset" className="gap-2">
            <KeyRound className="h-4 w-4" /> Reset Credentials
          </TabsTrigger>
          <TabsTrigger value="provision" className="gap-2">
            <UserPlus className="h-4 w-4" /> Provision Account Manager
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reset">
          <ResetCredentialsTab />
        </TabsContent>

        <TabsContent value="provision">
          <ProvisionAccountantTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Tab 1: Reset Credentials ────────────────────────────────────────────────

function ResetCredentialsTab() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null)
  
  // Reset Form State
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const { data: searchData, isFetching } = useQuery({
    queryKey: ['system-users-search', query],
    queryFn: () => fetchPaginatedApi<SystemUser>(`/api/users?query=${encodeURIComponent(query)}&limit=10`),
    enabled: query.length >= 2,
    staleTime: 10_000,
  })
  const users = useMemo(() => searchData?.data ?? [], [searchData?.data])

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected')
      if (!newEmail && !newPassword) throw new Error('Provide a new email or new password')
      
      await fetchApi('/api/users/reset-credentials', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUser.id,
          newEmail: newEmail || undefined,
          newPassword: newPassword || undefined,
        }),
      })
    },
    onSuccess: () => {
      notify.success('Credentials reset successfully', {
        description: `Updated access for ${selectedUser?.name}`,
      })
      queryClient.invalidateQueries({ queryKey: ['system-users-search'] })
      setSelectedUser(null)
      setNewEmail('')
      setNewPassword('')
      setQuery('')
    },
    onError: (e: unknown) => {
      notify.error('Reset failed', { description: e instanceof Error ? e.message : 'Unknown error' })
    },
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Left: Search */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">1. Locate User</CardTitle>
          <CardDescription>Search globally by name or email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search users…"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {isFetching && (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </p>
          )}
          {users.length > 0 && !selectedUser && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 divide-y">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setQuery('') }}
                  className="w-full text-left p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-slate-900">{u.name}</p>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      {u.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                  {u.adminProfile && <p className="text-xs text-indigo-600 mt-1">{u.adminProfile.campusName}</p>}
                  {u.accountantProfile && <p className="text-xs text-teal-600 mt-1">{u.accountantProfile.campusName} (Acc)</p>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Reset Action */}
      <Card className={!selectedUser ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader>
          <CardTitle className="text-base">2. Security Override</CardTitle>
          <CardDescription>
            {selectedUser 
              ? `Update credentials for ${selectedUser.name} (${selectedUser.role}).`
              : 'Select a user to perform a security override.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedUser && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-4">
              <p className="text-sm font-semibold text-red-900 mb-1">Audit Warning</p>
              <p className="text-xs text-red-800">
                This action forcefully invalidates current sessions for <strong>{selectedUser.email}</strong>. 
                A permanent audit record will log this override under your Super Admin credentials.
              </p>
            </div>
          )}

          <div className="space-y-4 max-w-md">
            <div className="space-y-1">
              <Label htmlFor="new-email">New Email Address</Label>
              <Input
                id="new-email"
                type="email"
                placeholder={selectedUser?.email ?? "Leave blank to keep current"}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="text" // Type text so admin can see what they are setting
                placeholder="Leave blank to keep current"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-[10px] text-slate-400">Must be at least 8 characters if provided.</p>
            </div>

            <div className="pt-4 flex gap-3">
              <Button
                variant="destructive"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending || (!newEmail && !newPassword)}
                className="gap-2"
              >
                {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Execute Override
              </Button>
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab 2: Provision Account Manager ───────────────────────────────────────

function ProvisionAccountantTab() {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', password: '', phoneNumber: '', campusId: '', employeeId: ''
  })

  // Fetch campuses for the dropdown
  const { data: campusData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchPaginatedApi<Campus>('/api/campuses?limit=100'),
  })
  const campuses = campusData?.data ?? []

  const provisionMutation = useMutation({
    mutationFn: async () => {
      await fetchApi('/api/users/create-accountant', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
    },
    onSuccess: () => {
      notify.success('Account Manager provisioned', {
        description: `${formData.firstName} ${formData.lastName} can now access the finance portal.`,
      })
      setFormData({ firstName: '', lastName: '', email: '', password: '', phoneNumber: '', campusId: '', employeeId: '' })
    },
    onError: (e: unknown) => {
      notify.error('Provisioning failed', { description: e instanceof Error ? e.message : 'Unknown error' })
    },
  })

  return (
    <Card className="max-w-3xl border-teal-100">
      <CardHeader className="bg-teal-50/50 border-b border-teal-100 pb-6 rounded-t-xl">
        <CardTitle className="text-teal-900">Provision Account Manager</CardTitle>
        <CardDescription className="text-teal-700/70">
          Create a new user with the ACCOUNTANT role. This grants them access to the Fee Collection Hub, 
          Expense Ledger, and Campus Financial Reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form 
          className="grid gap-6 md:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); provisionMutation.mutate() }}
        >
          <div className="space-y-1">
            <Label htmlFor="acc-first">First Name <span className="text-red-500">*</span></Label>
            <Input id="acc-first" required value={formData.firstName} onChange={(e) => setFormData(p => ({ ...p, firstName: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-last">Last Name <span className="text-red-500">*</span></Label>
            <Input id="acc-last" required value={formData.lastName} onChange={(e) => setFormData(p => ({ ...p, lastName: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-email">Email (Login ID) <span className="text-red-500">*</span></Label>
            <Input id="acc-email" type="email" required value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-pass">Temporary Password <span className="text-red-500">*</span></Label>
            <Input id="acc-pass" required minLength={8} value={formData.password} onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-phone">Phone Number <span className="text-red-500">*</span></Label>
            <Input id="acc-phone" required value={formData.phoneNumber} onChange={(e) => setFormData(p => ({ ...p, phoneNumber: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-campus">Assigned Campus <span className="text-red-500">*</span></Label>
            <Select value={formData.campusId} onValueChange={(v) => setFormData(p => ({ ...p, campusId: v }))}>
              <SelectTrigger id="acc-campus"><SelectValue placeholder="Select campus..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Campuses (Global Access)</SelectItem>
                {campuses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2 max-w-sm">
            <Label htmlFor="acc-emp">Employee ID (Optional)</Label>
            <Input id="acc-emp" placeholder="Auto-generated if left blank" value={formData.employeeId} onChange={(e) => setFormData(p => ({ ...p, employeeId: e.target.value }))} />
            <p className="text-[10px] text-slate-500 mt-1">Leave blank to auto-generate (e.g. ACC-2026-0001)</p>
          </div>
          
          <div className="md:col-span-2 pt-4 border-t border-slate-100">
            <Button type="submit" disabled={provisionMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white w-full sm:w-auto">
              {provisionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Create Account Manager
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
