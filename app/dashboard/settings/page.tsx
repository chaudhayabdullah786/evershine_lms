'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { 
  UserCircle, 
  Shield, 
  Search, 
  Key, 
  ShieldAlert, 
  Check, 
  Loader2, 
  Sparkles, 
  Plus, 
  AlertTriangle, 
  UserCheck, 
  Activity, 
  Building,
  ArrowRight,
  Info
} from 'lucide-react'
import { notify } from '@/lib/notify'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN'

  const [activeTab, setActiveTab] = useState<'profile' | 'credentials' | 'admins'>('profile')

  // Search & Filter States (Credentials Tab)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  // Dialog State (Credentials Tab)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [credentialsError, setCredentialsError] = useState<string | null>(null)

  // ─── Self-Password Change States ──────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPasswordSelf, setNewPasswordSelf] = useState('')
  const [confirmPasswordSelf, setConfirmPasswordSelf] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // ─── Admin Management States ──────────────────────────────────────────────────
  const [adminSearch, setAdminSearch] = useState('')
  const [adminRoleFilter, setAdminRoleFilter] = useState<'ALL' | 'SUPER_ADMIN' | 'ADMIN'>('ALL')
  const [adminPage, setAdminPage] = useState(1)

  // Dialog Trigger States
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<any>(null)
  const [adminSubmitError, setAdminSubmitError] = useState<string | null>(null)

  // Create Form Fields
  const [adminFirstName, setAdminFirstName] = useState('')
  const [adminLastName, setAdminLastName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminRole, setAdminRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN')
  const [adminCampusId, setAdminCampusId] = useState('')
  const [adminDepartment, setAdminDepartment] = useState('')
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false)

  // Edit Form Fields
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editRole, setEditRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN')
  const [editCampusId, setEditCampusId] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [isSavingAdminEdit, setIsSavingAdminEdit] = useState(false)

  // Query: Get Users Query (Credentials Tab - Standard Users)
  const { data: usersData, isLoading: isLoadingUsers, refetch } = useQuery({
    queryKey: ['admin-users-search', searchQuery, roleFilter, page],
    queryFn: () => fetchPaginatedApi<any>(
      `/api/users?query=${encodeURIComponent(searchQuery)}&role=${roleFilter === 'ALL' ? '' : roleFilter}&page=${page}&limit=10`
    ),
    enabled: isAdmin && activeTab === 'credentials',
  })

  const users = usersData?.data ?? []
  const totalUsers = usersData?.total ?? 0

  // Query: Get Admin Users List (Admin Control Tab)
  const { data: adminsData, isLoading: isLoadingAdmins, refetch: refetchAdmins } = useQuery({
    queryKey: ['admin-accounts-list', adminSearch, adminRoleFilter, adminPage],
    queryFn: () => fetchPaginatedApi<any>(
      `/api/users?query=${encodeURIComponent(adminSearch)}&role=${adminRoleFilter === 'ALL' ? 'ADMIN,SUPER_ADMIN' : adminRoleFilter}&page=${adminPage}&limit=10`
    ),
    enabled: isAdmin && activeTab === 'admins',
  })

  // Query: Get Active Campus Directory for Selection
  const { data: campusesData } = useQuery({
    queryKey: ['active-campuses-list'],
    queryFn: () => fetchPaginatedApi<any>('/api/campuses?limit=100'),
    enabled: isAdmin && (activeTab === 'admins'),
  })

  const adminsList = adminsData?.data ?? []
  const totalAdmins = adminsData?.total ?? 0
  const activeCampuses = campusesData?.data ?? []

  // Dynamic Summary metrics for Admin Tab
  const superAdminsCount = adminsList.filter((a: any) => a.role === 'SUPER_ADMIN').length
  const uniqueCampusesCount = new Set(
    adminsList
      .map((a: any) => a.adminProfile?.campusName)
      .filter((name: any) => name && name !== 'Unassigned')
  ).size

  // Password strength logic
  const calculatePasswordStrength = (pass: string) => {
    if (!pass) return 0
    let score = 0
    if (pass.length >= 8) score += 20
    if (/[A-Z]/.test(pass)) score += 20
    if (/[a-z]/.test(pass)) score += 20
    if (/[0-9]/.test(pass)) score += 20
    if (/[^A-Za-z0-9]/.test(pass)) score += 20
    return score
  }

  const getStrengthFeedback = (score: number) => {
    if (score <= 40) return { label: 'Weak Password', color: 'bg-rose-500', text: 'text-rose-500' }
    if (score <= 80) return { label: 'Medium Strength', color: 'bg-amber-500', text: 'text-amber-500' }
    return { label: 'Strong Security', color: 'bg-emerald-500', text: 'text-emerald-500' }
  }

  const strengthScore = calculatePasswordStrength(newPasswordSelf)
  const strengthFeedback = getStrengthFeedback(strengthScore)

  // Handle Save Profile Form (Fallback action)
  const handleSavePersonal = (e: React.FormEvent) => {
    e.preventDefault()
    notify.success('Profile settings are secure and up-to-date.')
  }

  // Handle Password Update Form
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!currentPassword || !newPasswordSelf || !confirmPasswordSelf) {
      setPasswordError('Please fill in all password fields.')
      return
    }

    if (newPasswordSelf !== confirmPasswordSelf) {
      setPasswordError('Your new passwords do not match.')
      return
    }

    if (newPasswordSelf.length < 8) {
      setPasswordError('Password must be at least 8 characters long.')
      return
    }

    if (strengthScore < 60) {
      setPasswordError('Please choose a stronger password containing uppercase, lowercase, and numeric characters.')
      return
    }

    setIsChangingPassword(true)
    try {
      await fetchApi('/api/users/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword: newPasswordSelf,
          confirmPassword: confirmPasswordSelf,
        }),
      })
      notify.success('Success', { description: 'Your password was updated successfully.' })
      setCurrentPassword('')
      setNewPasswordSelf('')
      setConfirmPasswordSelf('')
    } catch (err: any) {
      setPasswordError(err.message || 'Incorrect current password or invalid password structure.')
      notify.error('Password Update Failed')
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Handle credentials reset (Credentials Tab)
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCredentialsError(null)
    if (!selectedUser) return

    if (!newEmail && !newPassword) {
      setCredentialsError('Please provide a new email or password to reset')
      return
    }

    setIsResetting(true)
    try {
      await fetchApi('/api/users/reset-credentials', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUser.id,
          newEmail: newEmail !== selectedUser.email ? newEmail : undefined,
          newPassword: newPassword || undefined,
        })
      })
      notify.success('Credentials updated successfully!')
      setSelectedUser(null)
      setNewPassword('')
      refetch()
    } catch (err: any) {
      setCredentialsError(err.message || 'Failed to update credentials')
    } finally {
      setIsResetting(false)
    }
  }

  const openResetDialog = (user: any) => {
    setSelectedUser(user)
    setNewEmail(user.email)
    setNewPassword('')
    setCredentialsError(null)
  }

  // Handle Create Admin Form Submit
  const handleCreateAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminSubmitError(null)

    if (!adminFirstName || !adminLastName || !adminEmail || !adminPassword || !adminCampusId) {
      setAdminSubmitError('Please complete all required fields.')
      return
    }

    setIsCreatingAdmin(true)
    try {
      await fetchApi('/api/users/create-admin', {
        method: 'POST',
        body: JSON.stringify({
          firstName: adminFirstName,
          lastName: adminLastName,
          email: adminEmail,
          password: adminPassword,
          role: adminRole,
          campusId: adminCampusId,
          department: adminDepartment || undefined,
        }),
      })
      notify.success('Admin Created', { description: `${adminFirstName} ${adminLastName} has been provisioned as an administrator.` })
      setIsCreateAdminOpen(false)
      // Reset form
      setAdminFirstName('')
      setAdminLastName('')
      setAdminEmail('')
      setAdminPassword('')
      setAdminRole('ADMIN')
      setAdminCampusId('')
      setAdminDepartment('')
      refetchAdmins()
    } catch (err: any) {
      setAdminSubmitError(err.message || 'Could not provision new administrative account.')
    } finally {
      setIsCreatingAdmin(false)
    }
  }

  // Handle Edit Admin Form Submit
  const handleEditAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminSubmitError(null)
    if (!editingAdmin) return

    if (!editFirstName || !editLastName || !editCampusId) {
      setAdminSubmitError('First Name, Last Name, and Campus are required fields.')
      return
    }

    setIsSavingAdminEdit(true)
    try {
      await fetchApi(`/api/users/${editingAdmin.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          role: editRole,
          campusId: editCampusId,
          department: editDepartment || null,
        }),
      })
      notify.success('Admin Updated', { description: 'Administrator profile assignments saved successfully.' })
      setEditingAdmin(null)
      refetchAdmins()
    } catch (err: any) {
      setAdminSubmitError(err.message || 'Could not save administrative assignments.')
    } finally {
      setIsSavingAdminEdit(false)
    }
  }

  // Toggle Admin Account access status
  const handleToggleAdminStatus = async (adminUser: any) => {
    if (session?.user?.id === adminUser.id) {
      notify.error('Safety Gate', { description: 'You cannot deactivate your own account.' })
      return
    }

    const nextStatus = !adminUser.isActive
    const confirmation = window.confirm(`Are you sure you want to ${nextStatus ? 'reactivate' : 'suspend'} admin access for ${adminUser.name}?`)
    if (!confirmation) return

    try {
      await fetchApi(`/api/users/${adminUser.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: nextStatus,
        }),
      })
      notify.success('Status Updated', { description: `Access status for ${adminUser.name} has been updated.` })
      await queryClient.invalidateQueries({ queryKey: ['admin-users-search'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-accounts-list'] })
    } catch (err: any) {
      notify.error('Failed to update status', { description: err.message })
    }
  }

  // Toggle User Account access status (Students, Teachers, Accountants, Guardians, Parents, Admins)
  const handleToggleUserStatus = async (targetUser: any) => {
    if (session?.user?.id === targetUser.id) {
      notify.error('Safety Gate', { description: 'You cannot deactivate your own account.' })
      return
    }

    const nextStatus = !targetUser.isActive
    const confirmation = window.confirm(`Are you sure you want to ${nextStatus ? 'reactivate' : 'suspend'} access for ${targetUser.name}?`)
    if (!confirmation) return

    try {
      await fetchApi(`/api/users/${targetUser.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: nextStatus,
        }),
      })
      notify.success('Status Updated', { description: `Access status for ${targetUser.name} has been updated.` })
      await queryClient.invalidateQueries({ queryKey: ['admin-users-search'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-accounts-list'] })
    } catch (err: any) {
      notify.error('Failed to update status', { description: err.message })
    }
  }

  const openEditAdminDialog = (adminUser: any) => {
    setEditingAdmin(adminUser)
    setAdminSubmitError(null)
    setEditFirstName(adminUser.adminProfile?.firstName || adminUser.name.split(' ')[0] || '')
    setEditLastName(adminUser.adminProfile?.lastName || adminUser.name.split(' ').slice(1).join(' ') || '')
    setEditRole(adminUser.role)
    setEditCampusId(adminUser.adminProfile?.campusId || '')
    setEditDepartment(adminUser.adminProfile?.department === 'N/A' ? '' : adminUser.adminProfile?.department || '')
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            Settings <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
          </h1>
          <p className="text-xs text-gray-500 font-medium">Manage your personal settings and administrative controls.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1">
          <Card className="rounded-xl border shadow-sm bg-white p-3 space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 text-left border-l-2 ${
                activeTab === 'profile'
                  ? 'bg-indigo-600/5 text-indigo-700 border-indigo-600 shadow-sm'
                  : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <UserCircle className="w-4 h-4" /> Profile & Security
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('credentials')}
                  className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 text-left border-l-2 ${
                    activeTab === 'credentials'
                      ? 'bg-indigo-600/5 text-indigo-700 border-indigo-600 shadow-sm'
                      : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" /> Reset User Credentials
                </button>
                <button
                  onClick={() => setActiveTab('admins')}
                  className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 text-left border-l-2 ${
                    activeTab === 'admins'
                      ? 'bg-indigo-600/5 text-indigo-700 border-indigo-600 shadow-sm'
                      : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Shield className="w-4 h-4" /> Admin & Access Control
                </button>
              </>
            )}
          </Card>
        </div>

        {/* Dynamic Content Area */}
        <div className="md:col-span-3 space-y-6">
          {activeTab === 'profile' && (
            <>
              {/* Profile Card */}
              <Card className="rounded-xl border shadow-sm bg-white overflow-hidden transition-all hover:shadow-md duration-300">
                <CardHeader className="border-b bg-gray-50/50 py-4">
                  <CardTitle className="text-sm font-bold text-gray-900">Profile Information</CardTitle>
                  <CardDescription className="text-xs">Your basic account details.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleSavePersonal} className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-gray-700">Email Address</Label>
                      <Input value={session?.user?.email || ''} disabled className="bg-gray-50 text-gray-500 text-xs h-9 border-gray-200 cursor-not-allowed" />
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                        <Info className="w-3.5 h-3.5" />
                        <span>Email cannot be modified by yourself. Contact system administrator.</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-gray-700">User Role</Label>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-lg max-w-xs transition-colors hover:bg-gray-100/50">
                        <Shield className="w-4 h-4 text-indigo-600 animate-pulse" />
                        <span className="text-xs font-bold text-gray-700">{session?.user?.role}</span>
                      </div>
                    </div>

                    <Button type="submit" className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold px-5 transition-all">
                      Save Changes
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Password Card */}
              <Card className="rounded-xl border shadow-sm bg-white overflow-hidden transition-all hover:shadow-md duration-300">
                <CardHeader className="border-b bg-gray-50/50 py-4">
                  <CardTitle className="text-sm font-bold text-gray-900">Change Password</CardTitle>
                  <CardDescription className="text-xs">Ensure your account is using a long, random password to stay secure.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                    {/* Error Banner */}
                    {passwordError && (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 animate-shake">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <span className="text-xs font-medium">{passwordError}</span>
                      </div>
                    )}

                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-gray-700">Current Password</Label>
                        <Input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="text-xs h-9 bg-white focus-visible:ring-indigo-500"
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-gray-700">New Password</Label>
                          <Input
                            type="password"
                            value={newPasswordSelf}
                            onChange={(e) => setNewPasswordSelf(e.target.value)}
                            placeholder="•••••••• (Min 8 chars)"
                            className="text-xs h-9 bg-white focus-visible:ring-indigo-500"
                          />
                          {/* Strength Indicator */}
                          {newPasswordSelf && (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex justify-between items-center text-[9px] font-bold">
                                <span className={strengthFeedback.text}>{strengthFeedback.label}</span>
                                <span className="text-gray-400">{strengthScore}%</span>
                              </div>
                              <div className="h-1 w-full bg-gray-150 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${strengthFeedback.color} transition-all duration-300`} 
                                  style={{ width: `${strengthScore}%` }} 
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-gray-700">Confirm New Password</Label>
                          <Input
                            type="password"
                            value={confirmPasswordSelf}
                            onChange={(e) => setConfirmPasswordSelf(e.target.value)}
                            placeholder="••••••••"
                            className="text-xs h-9 bg-white focus-visible:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      type="submit"
                      disabled={isChangingPassword}
                      className="text-xs h-9 font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-5 shadow-sm transition-all"
                    >
                      {isChangingPassword ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Updating Password...
                        </>
                      ) : (
                        'Update Password'
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === 'credentials' && isAdmin && (
            <Card className="rounded-xl border shadow-sm bg-white overflow-hidden transition-all hover:shadow-md duration-300">
              <CardHeader className="border-b bg-gray-50/50 py-4">
                <CardTitle className="text-sm font-bold text-gray-900">Credential Control Center</CardTitle>
                <CardDescription className="text-xs">Quick search and reset email/password credentials for any active staff, student, or guardian account.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by Name or Email..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                      className="pl-9 text-xs h-9 bg-white"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={(val) => { setRoleFilter(val); setPage(1) }}>
                    <SelectTrigger className="w-full sm:w-44 text-xs h-9 bg-white">
                      <SelectValue placeholder="All Roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="text-xs">All Roles</SelectItem>
                      <SelectItem value="SUPER_ADMIN" className="text-xs">Super Admin</SelectItem>
                      <SelectItem value="ADMIN" className="text-xs">Admin</SelectItem>
                      <SelectItem value="TEACHER" className="text-xs">Teacher</SelectItem>
                      <SelectItem value="STUDENT" className="text-xs">Student</SelectItem>
                      <SelectItem value="ACCOUNTANT" className="text-xs">Account Manager</SelectItem>
                      <SelectItem value="PARENT" className="text-xs">Parent</SelectItem>
                      <SelectItem value="GUARDIAN" className="text-xs">Guardian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Users List */}
                {isLoadingUsers ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <p className="text-xs text-gray-400 font-bold">Loading user database...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-12 border border-dashed rounded-xl bg-gray-50">
                    <UserCircle className="w-8 h-8 mx-auto text-gray-350" />
                    <p className="text-xs text-gray-500 font-medium mt-2">No matching users found.</p>
                  </div>
                ) : (
                  <div className="border rounded-xl overflow-hidden bg-white shadow-sm transition-all">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50/75 border-b text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                            <th className="px-4 py-3">Associated Profile</th>
                            <th className="px-4 py-3">Login Email</th>
                            <th className="px-4 py-3">System Role</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-xs text-gray-700">
                          {users.map((u: any) => (
                            <tr key={u.id} className="hover:bg-indigo-50/20 transition-colors duration-150">
                              <td className="px-4 py-3.5 font-bold text-gray-900">{u.name}</td>
                              <td className="px-4 py-3.5 font-mono text-[11px] text-gray-500">{u.email}</td>
                              <td className="px-4 py-3.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <button
                                  onClick={() => handleToggleUserStatus(u)}
                                  disabled={
                                    session?.user?.id === u.id ||
                                    (session?.user?.role === 'ADMIN' && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'))
                                  }
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                    session?.user?.id === u.id ||
                                    (session?.user?.role === 'ADMIN' && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'))
                                      ? 'opacity-60 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200' 
                                      : 'hover:opacity-85 shadow-sm active:scale-95'
                                  } ${
                                    u.isActive 
                                      ? 'bg-green-50 text-green-700 border-green-200 shadow-green-50' 
                                      : 'bg-rose-50 text-rose-700 border-rose-200 shadow-rose-50'
                                  }`}
                                >
                                  {u.isActive ? 'Active' : 'Suspended'}
                                </button>
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <Button
                                  size="sm"
                                  disabled={session?.user?.role === 'ADMIN' && u.role === 'SUPER_ADMIN'}
                                  onClick={() => openResetDialog(u)}
                                  className="h-7 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 gap-1 border border-indigo-150 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Key className="w-3 h-3" /> Reset Credentials
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Bar */}
                    {totalUsers > 10 && (
                      <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
                        <span className="text-[10px] text-gray-500 font-bold">
                          Showing {users.length} of {totalUsers} Accounts
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-7 text-[10px] active:scale-95"
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page * 10 >= totalUsers}
                            onClick={() => setPage(p => p + 1)}
                            className="h-7 text-[10px] active:scale-95"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'admins' && isAdmin && (
            <div className="space-y-6 animate-fadeIn">
              {/* Core Analytics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="rounded-xl border shadow-sm bg-white p-4.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-100 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                    <UserCheck className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">Total Administrators</p>
                    <h3 className="text-xl font-black text-gray-900 leading-none mt-1">{totalAdmins}</h3>
                  </div>
                </Card>
                <Card className="rounded-xl border shadow-sm bg-white p-4.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-100 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-600">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">Super Admins</p>
                    <h3 className="text-xl font-black text-gray-900 leading-none mt-1">{superAdminsCount}</h3>
                  </div>
                </Card>
                <Card className="rounded-xl border shadow-sm bg-white p-4.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-100 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
                    <Building className="w-5 h-5 animate-bounce duration-1000" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">Campus Divisions</p>
                    <h3 className="text-xl font-black text-gray-900 leading-none mt-1">{uniqueCampusesCount}</h3>
                  </div>
                </Card>
              </div>

              {/* Access Control Card */}
              <Card className="rounded-xl border shadow-sm bg-white overflow-hidden transition-all hover:shadow-md duration-300">
                <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      Admin Directory <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                    </CardTitle>
                    <CardDescription className="text-xs">Manage administrative users, assign school campuses, and delegate permissions.</CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setAdminSubmitError(null)
                      setIsCreateAdminOpen(true)
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold h-9 px-4 rounded-lg flex items-center gap-1.5 shadow-sm border border-indigo-500 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Add Administrator
                  </Button>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Search & Filter */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search admin profiles by name, email, department..."
                        value={adminSearch}
                        onChange={(e) => { setAdminSearch(e.target.value); setAdminPage(1) }}
                        className="pl-9 text-xs h-9 bg-white focus-visible:ring-indigo-500"
                      />
                    </div>
                    <Select
                      value={adminRoleFilter}
                      onValueChange={(val) => { setAdminRoleFilter(val as any); setAdminPage(1) }}
                    >
                      <SelectTrigger className="w-full sm:w-44 text-xs h-9 bg-white">
                        <SelectValue placeholder="All Admin Roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">All Admin Roles</SelectItem>
                        <SelectItem value="SUPER_ADMIN" className="text-xs">Super Admin</SelectItem>
                        <SelectItem value="ADMIN" className="text-xs">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Admins Table */}
                  {isLoadingAdmins ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                      <p className="text-xs text-gray-400 font-bold">Loading administrator directory...</p>
                    </div>
                  ) : adminsList.length === 0 ? (
                    <div className="text-center py-12 border border-dashed rounded-xl bg-gray-50">
                      <Shield className="w-8 h-8 mx-auto text-gray-300 animate-pulse" />
                      <p className="text-xs text-gray-500 font-medium mt-2">No administrators found matching current criteria.</p>
                    </div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden bg-white shadow-sm transition-all duration-300">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50/75 border-b text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                              <th className="px-4 py-3">Administrator</th>
                              <th className="px-4 py-3">Email Address</th>
                              <th className="px-4 py-3">Campus Scope</th>
                              <th className="px-4 py-3">Department</th>
                              <th className="px-4 py-3">Role</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y text-xs text-gray-700">
                            {adminsList.map((u: any) => {
                              const avatarInitials = u.name 
                                ? u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                                : 'AD'

                              return (
                                <tr key={u.id} className="hover:bg-indigo-50/10 transition-colors duration-150">
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[10px] font-black shadow-sm tracking-tighter">
                                        {avatarInitials}
                                      </div>
                                      <span className="font-bold text-gray-900">{u.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 font-mono text-[11px] text-gray-500">{u.email}</td>
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-800 text-[10px] font-bold shadow-sm shadow-blue-50/50">
                                      {u.adminProfile?.campusName || 'Unassigned'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-gray-600 font-medium">{u.adminProfile?.department || 'N/A'}</td>
                                  <td className="px-4 py-3.5">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black border tracking-wider uppercase shadow-sm ${
                                      u.role === 'SUPER_ADMIN' 
                                        ? 'bg-amber-50/80 border-amber-200 text-amber-800 shadow-amber-50/50' 
                                        : 'bg-indigo-50/80 border-indigo-200 text-indigo-800 shadow-indigo-50/50'
                                    }`}>
                                      {u.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <button
                                      onClick={() => handleToggleAdminStatus(u)}
                                      disabled={
                                        session?.user?.id === u.id ||
                                        (session?.user?.role === 'ADMIN' && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'))
                                      }
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                        session?.user?.id === u.id ||
                                        (session?.user?.role === 'ADMIN' && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'))
                                          ? 'opacity-60 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200' 
                                          : 'hover:opacity-85 shadow-sm active:scale-95'
                                      } ${
                                        u.isActive 
                                          ? 'bg-green-50 text-green-700 border-green-200 shadow-green-50' 
                                          : 'bg-rose-50 text-rose-700 border-rose-200 shadow-rose-50'
                                      }`}
                                    >
                                      {u.isActive ? 'Active' : 'Suspended'}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <Button
                                      size="sm"
                                      disabled={session?.user?.role === 'ADMIN' && u.role === 'SUPER_ADMIN'}
                                      onClick={() => openEditAdminDialog(u)}
                                      className="h-7 text-[10px] font-bold bg-white hover:bg-gray-50 active:scale-95 text-gray-700 border border-gray-250 rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Edit Scope
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalAdmins > 10 && (
                        <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
                          <span className="text-[10px] text-gray-500 font-bold">
                            Showing {adminsList.length} of {totalAdmins} Administrators
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={adminPage === 1}
                              onClick={() => setAdminPage(p => Math.max(1, p - 1))}
                              className="h-7 text-[10px] active:scale-95"
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={adminPage * 10 >= totalAdmins}
                              onClick={() => setAdminPage(p => p + 1)}
                              className="h-7 text-[10px] active:scale-95"
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Credentials Reset Modal Dialog */}
      {selectedUser && (
        <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
          <DialogContent className="sm:max-w-md p-6 rounded-xl border bg-white shadow-xl animate-scaleIn">
            <DialogHeader className="pb-4 border-b">
              <div className="flex items-center gap-2 text-rose-700">
                <ShieldAlert className="w-5 h-5 animate-bounce" />
                <DialogTitle className="text-base font-black text-gray-900">Reset Credentials</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-gray-500">
                Updating credentials for <span className="font-bold text-gray-800">{selectedUser.name}</span> ({selectedUser.role}).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResetSubmit} className="space-y-4 pt-4">
              {/* Error Banner */}
              {credentialsError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="text-xs font-medium">{credentialsError}</span>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-bold text-gray-700">Login Email Address</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                />
                <p className="text-[9px] text-gray-400">Updating this will automatically sync emails in the corresponding student/staff profile.</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-gray-700">New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="•••••••• (Min 8 characters)"
                  className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                />
                <p className="text-[9px] text-gray-400">Leave empty to keep the current password unchanged.</p>
              </div>

              <DialogFooter className="pt-4 border-t gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setSelectedUser(null)} className="text-xs h-9 active:scale-95 transition-transform">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isResetting}
                  className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 px-5 shadow-sm border border-indigo-500 active:scale-95 transition-transform"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Credentials
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Administrator Modal Dialog */}
      {isCreateAdminOpen && (
        <Dialog open={isCreateAdminOpen} onOpenChange={(open) => !open && setIsCreateAdminOpen(false)}>
          <DialogContent className="sm:max-w-md p-6 rounded-xl border bg-white shadow-xl animate-scaleIn">
            <DialogHeader className="pb-4 border-b">
              <div className="flex items-center gap-2 text-indigo-750">
                <Shield className="w-5 h-5 text-indigo-650 animate-pulse" />
                <DialogTitle className="text-base font-black text-gray-900">Add New Administrator</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-gray-500">
                Provision a new administrator account and assign their school campus profile.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateAdminSubmit} className="space-y-4 pt-4">
              {/* Error Banner */}
              {adminSubmitError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="text-xs font-medium">{adminSubmitError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">First Name <span className="text-rose-500">*</span></Label>
                  <Input
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    required
                    placeholder="e.g. John"
                    className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">Last Name <span className="text-rose-500">*</span></Label>
                  <Input
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    required
                    placeholder="e.g. Doe"
                    className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-gray-700">Login Email Address <span className="text-rose-500">*</span></Label>
                <Input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                  placeholder="admin.name@evershaheen.edu"
                  className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-gray-700">Password <span className="text-rose-500">*</span></Label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  placeholder="•••••••• (Min 8 chars)"
                  className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">System Role <span className="text-rose-500">*</span></Label>
                  <Select value={adminRole} onValueChange={(val) => setAdminRole(val as any)}>
                    <SelectTrigger className="text-xs h-9 bg-white border-gray-200 focus:ring-indigo-500">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN" className="text-xs">Admin</SelectItem>
                      {session?.user?.role === 'SUPER_ADMIN' && (
                        <SelectItem value="SUPER_ADMIN" className="text-xs">Super Admin</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">Campus Scope <span className="text-rose-500">*</span></Label>
                  <Select value={adminCampusId} onValueChange={setAdminCampusId}>
                    <SelectTrigger className="text-xs h-9 bg-white border-gray-200 focus:ring-indigo-500">
                      <SelectValue placeholder="Select Campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCampuses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-gray-700">Department / Title <span className="text-gray-400">(Optional)</span></Label>
                <Input
                  value={adminDepartment}
                  onChange={(e) => setAdminDepartment(e.target.value)}
                  placeholder="e.g. Academic Head, HR Manager"
                  className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                />
              </div>

              <DialogFooter className="pt-4 border-t gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setIsCreateAdminOpen(false)} className="text-xs h-9 active:scale-95 transition-transform">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingAdmin}
                  className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 px-5 shadow-sm border border-indigo-500 active:scale-95 transition-transform"
                >
                  {isCreatingAdmin ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Create Administrator
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Administrator Modal Dialog */}
      {editingAdmin && (
        <Dialog open={!!editingAdmin} onOpenChange={(open) => !open && setEditingAdmin(null)}>
          <DialogContent className="sm:max-w-md p-6 rounded-xl border bg-white shadow-xl animate-scaleIn">
            <DialogHeader className="pb-4 border-b">
              <div className="flex items-center gap-2 text-indigo-750">
                <Shield className="w-5 h-5 text-indigo-600 animate-pulse" />
                <DialogTitle className="text-base font-black text-gray-900">Edit Administrator Assignments</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-gray-500">
                Update assignments and administrative details for <span className="font-bold text-gray-800">{editingAdmin.name}</span>.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleEditAdminSubmit} className="space-y-4 pt-4">
              {/* Error Banner */}
              {adminSubmitError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="text-xs font-medium">{adminSubmitError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">First Name <span className="text-rose-500">*</span></Label>
                  <Input
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    required
                    className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">Last Name <span className="text-rose-500">*</span></Label>
                  <Input
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    required
                    className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">System Role <span className="text-rose-500">*</span></Label>
                  <Select value={editRole} onValueChange={(val) => setEditRole(val as any)}>
                    <SelectTrigger className="text-xs h-9 bg-white border-gray-200 focus:ring-indigo-500">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN" className="text-xs">Admin</SelectItem>
                      {session?.user?.role === 'SUPER_ADMIN' && (
                        <SelectItem value="SUPER_ADMIN" className="text-xs">Super Admin</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-700">Campus Assignment <span className="text-rose-500">*</span></Label>
                  <Select value={editCampusId} onValueChange={setEditCampusId}>
                    <SelectTrigger className="text-xs h-9 bg-white border-gray-200 focus:ring-indigo-500">
                      <SelectValue placeholder="Select Campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCampuses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-gray-700">Department / Title <span className="text-gray-400">(Optional)</span></Label>
                <Input
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  placeholder="e.g. Academic Head, HR Manager"
                  className="text-xs h-9 bg-white focus-visible:ring-indigo-500 border-gray-200"
                />
              </div>

              <DialogFooter className="pt-4 border-t gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setEditingAdmin(null)} className="text-xs h-9 active:scale-95 transition-transform">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingAdminEdit}
                  className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 px-5 shadow-sm border border-indigo-500 active:scale-95 transition-transform"
                >
                  {isSavingAdminEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Assignments
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
