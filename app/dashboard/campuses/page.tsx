'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Plus, Building2, MapPin, Search, Loader2, Phone, Mail, User, Users,
  GraduationCap, Trash2, Settings, Eye, BookOpen, Sparkles, AlertCircle, ArrowLeft, ArrowRight,
  ArrowRightLeft,
} from 'lucide-react'
import { TransferEntityDialog, type TransferEntityType } from '@/components/admin/TransferEntityDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { createCampusSchema } from '@/lib/validation/batch'
import { AccessDenied } from '@/components/AccessDenied'

type CreateCampusForm = z.infer<typeof createCampusSchema>

interface Campus {
  id: string
  name: string
  code: string
  address: string
  phone: string
  email: string
  principalName: string
  isActive: boolean
  _count?: {
    students: number
    teachers: number
    batches: number
  }
}

export default function CampusesPage() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()

  const role = session?.user?.role ?? 'STUDENT'
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const isAdminOrSuper = role === 'SUPER_ADMIN' || role === 'ADMIN'

  // Primary page search & creation states
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Manage details dynamic states
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'students' | 'teachers'>('settings')

  // Directories pagination/search states
  const [studentSearch, setStudentSearch] = useState('')
  const [studentPage, setStudentPage] = useState(1)
  const [teacherSearch, setTeacherSearch] = useState('')
  const [teacherPage, setTeacherPage] = useState(1)
  const [transferDialog, setTransferDialog] = useState<{
    entityType: TransferEntityType
    entityId: string
    entityLabel: string
    batchId?: string
  } | null>(null)

  // ─── QUERY: Get Campus List ──────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['campuses', search],
    queryFn: () => fetchApi<Campus[]>(`/api/campuses?search=${search}&limit=50`),
    enabled: isAdminOrSuper,
  })

  // ─── QUERY: Scoped Campus Students ──────────────────────────────────────────
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['campus-students', selectedCampus?.id, studentSearch, studentPage],
    queryFn: () => {
      if (!selectedCampus?.id) return null
      return fetchPaginatedApi<any>(
        `/api/students?campusId=${selectedCampus.id}&search=${studentSearch}&page=${studentPage}&limit=5`
      )
    },
    enabled: isAdminOrSuper && !!selectedCampus?.id && activeTab === 'students',
  })

  // ─── QUERY: Scoped Campus Teachers ──────────────────────────────────────────
  const { data: teachersData, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ['campus-teachers', selectedCampus?.id, teacherSearch, teacherPage],
    queryFn: () => {
      if (!selectedCampus?.id) return null
      return fetchPaginatedApi<any>(
        `/api/teachers?campusId=${selectedCampus.id}&search=${teacherSearch}&page=${teacherPage}&limit=5`
      )
    },
    enabled: isAdminOrSuper && !!selectedCampus?.id && activeTab === 'teachers',
  })

  // ─── FORMS INITIALIZATION ───────────────────────────────────────────────────
  const createForm = useForm<CreateCampusForm>({
    resolver: zodResolver(createCampusSchema),
    defaultValues: { name: '', code: '', address: '', phone: '', email: '', principalName: '' }
  })

  const editForm = useForm<CreateCampusForm>({
    resolver: zodResolver(createCampusSchema),
    defaultValues: { name: '', code: '', address: '', phone: '', email: '', principalName: '' }
  })

  // ─── MUTATIONS ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (values: CreateCampusForm) => {
      return fetchApi('/api/campuses', {
        method: 'POST',
        body: JSON.stringify(values)
      })
    },
    onSuccess: () => {
      notify.success('Campus created successfully!')
      queryClient.invalidateQueries({ queryKey: ['campuses'] })
      setIsCreateModalOpen(false)
      createForm.reset()
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to create campus')
    }
  })

  const editMutation = useMutation({
    mutationFn: async (values: CreateCampusForm) => {
      return fetchApi(`/api/campuses/${selectedCampus?.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values)
      })
    },
    onSuccess: () => {
      notify.success('Campus details updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['campuses'] })
      setIsManageModalOpen(false)
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to update campus details')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return fetchApi(`/api/campuses/${selectedCampus?.id}`, {
        method: 'DELETE'
      })
    },
    onSuccess: () => {
      notify.success('Campus branch deactivated successfully!')
      queryClient.invalidateQueries({ queryKey: ['campuses'] })
      setIsManageModalOpen(false)
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to deactivate campus')
    }
  })

  // Route guard: only admins can access campus management
  if (status === 'loading') return null
  if (!isAdminOrSuper) {
    return (
      <AccessDenied
        title="Campus Management Restricted"
        message="Campus branch management is restricted to administrators only."
      />
    )
  }

  // ─── HANDLERS ───────────────────────────────────────────────────────────────
  const onCreateSubmit = (values: CreateCampusForm) => {
    createMutation.mutate(values)
  }

  const onEditSubmit = (values: CreateCampusForm) => {
    editMutation.mutate(values)
  }

  const openManageCampus = (campus: Campus) => {
    setSelectedCampus(campus)
    setActiveTab('settings')
    setStudentSearch('')
    setStudentPage(1)
    setTeacherSearch('')
    setTeacherPage(1)

    editForm.reset({
      name: campus.name,
      code: campus.code,
      address: campus.address,
      phone: campus.phone,
      email: campus.email,
      principalName: campus.principalName || ''
    })
    setIsManageModalOpen(true)
  }

  const campusesRaw = data ?? []
  const campuses: Campus[] = Array.isArray(campusesRaw)
    ? campusesRaw
    : (campusesRaw as any)?.data && Array.isArray((campusesRaw as any).data)
    ? (campusesRaw as any).data
    : []

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 md:px-0">
      {/* Dynamic Aesthetic Title Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border shadow-sm transition-all duration-300">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600 animate-pulse" />
            <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-none">Campus branches</h1>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            View enrolled directory lists and control academic locations across boys and girls modules.
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            className="gap-2 rounded-xl h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-sm hover:scale-[1.02]"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-4 h-4" /> Add Campus
          </Button>
        )}
      </div>

      {/* Modern Search Controls */}
      <div className="flex items-center bg-white p-3 rounded-xl border shadow-sm max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search campuses by name, code or location..."
            className="pl-9 h-[38px] border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-semibold placeholder:text-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of campuses */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-2xl border overflow-hidden shadow-sm">
              <CardHeader className="h-16 bg-gray-50 border-b flex items-center justify-between">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-12" />
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </CardContent>
            </Card>
          ))
        ) : campuses.length === 0 ? (
          <div className="col-span-full bg-white border rounded-2xl p-16 text-center text-gray-400 shadow-sm">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-indigo-300 animate-bounce" />
            <h3 className="font-extrabold text-gray-800 text-lg">No branch campuses found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              No registered physical branch fits your query criteria. Use the create action to register a new one.
            </p>
          </div>
        ) : (
          campuses.map((campus) => (
            <Card
              key={campus.id}
              className={`group hover:shadow-lg transition-all duration-300 rounded-2xl border overflow-hidden bg-white ${
                !campus.isActive ? 'opacity-70 grayscale-[30%]' : ''
              }`}
            >
              <CardHeader className="pb-3.5 border-b bg-gray-50/50 transition-colors group-hover:bg-indigo-50/20 px-5 pt-5">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-black text-gray-900 tracking-tight leading-snug group-hover:text-indigo-600 transition-colors">
                      {campus.name}
                    </CardTitle>
                    <CardDescription className="font-bold text-xs mt-1 text-indigo-500 font-mono tracking-wider">
                      CODE: {campus.code}
                    </CardDescription>
                  </div>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest ${
                      campus.isActive
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {campus.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed font-semibold">
                  <MapPin className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{campus.address}</span>
                </div>

                {/* Sub-counts Metric Grid */}
                <div className="grid grid-cols-3 gap-2 pt-2.5 text-center bg-gray-50/60 p-3 rounded-xl border border-gray-100/80">
                  <div>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider">Students</p>
                    <p className="font-black text-indigo-600 text-sm mt-0.5">
                      {(campus._count?.students ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider">Teachers</p>
                    <p className="font-black text-blue-600 text-sm mt-0.5">
                      {(campus._count?.teachers ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider">Batches</p>
                    <p className="font-black text-emerald-600 text-sm mt-0.5">
                      {(campus._count?.batches ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Principal/Contact details */}
                <div className="space-y-1.5 text-xs pt-3.5 border-t">
                  <div className="flex items-center gap-2 text-gray-600">
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-bold text-gray-400">Principal:</span>
                    <span className="text-gray-800 font-extrabold">{campus.principalName || 'Not Assigned'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-bold text-gray-400">Phone:</span>
                    <span className="text-gray-800 font-extrabold">{campus.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-bold text-gray-400">Email:</span>
                    <span className="text-gray-800 font-extrabold truncate">{campus.email}</span>
                  </div>
                </div>

                {isAdminOrSuper && (
                  <div className="pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-black rounded-xl border-gray-200 text-indigo-600 hover:bg-indigo-50/50 hover:text-indigo-700 h-[36px] gap-1"
                      onClick={() => openManageCampus(campus)}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Manage Campus & Directory
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ── DIALOG: Add Campus ────────────────────────────────────────────────────── */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 tracking-tight">Add New Campus</DialogTitle>
            <DialogDescription className="text-xs font-medium text-gray-500">
              Create a new physical branch for Evershaheen Academy.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Campus Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Boys Campus" className="rounded-xl" {...createForm.register('name')} />
                {createForm.formState.errors.name && (
                  <p className="text-[10px] text-red-500 font-bold">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Campus Code <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. BC" className="rounded-xl uppercase" {...createForm.register('code')} />
                {createForm.formState.errors.code && (
                  <p className="text-[10px] text-red-500 font-bold">{createForm.formState.errors.code.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">Address <span className="text-red-500">*</span></Label>
              <Input placeholder="123 Main St, Sector-G, Peshawar" className="rounded-xl" {...createForm.register('address')} />
              {createForm.formState.errors.address && (
                <p className="text-[10px] text-red-500 font-bold">{createForm.formState.errors.address.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Contact Number <span className="text-red-500">*</span></Label>
                <Input placeholder="+923001234567" className="rounded-xl" {...createForm.register('phone')} />
                {createForm.formState.errors.phone && (
                  <p className="text-[10px] text-red-500 font-bold">{createForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Email Address <span className="text-red-500">*</span></Label>
                <Input type="email" placeholder="boys.campus@evershaheen.edu.pk" className="rounded-xl" {...createForm.register('email')} />
                {createForm.formState.errors.email && (
                  <p className="text-[10px] text-red-500 font-bold">{createForm.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">Principal Name <span className="text-red-500">*</span></Label>
              <Input placeholder="Prof. John Doe" className="rounded-xl" {...createForm.register('principalName')} />
              {createForm.formState.errors.principalName && (
                <p className="text-[10px] text-red-500 font-bold">{createForm.formState.errors.principalName.message}</p>
              )}
            </div>

            <DialogFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" className="rounded-xl font-bold border-gray-200 text-gray-500" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Register Branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Unified Campus Manager & Scoped Directory ─────────────────────── */}
      <Dialog open={isManageModalOpen} onOpenChange={setIsManageModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-600" />
              {selectedCampus?.name}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-gray-400">
              Update configurations, examine student rosters, or inspect academic specialization fields.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-3 h-10 rounded-xl bg-gray-100 p-1">
              <TabsTrigger value="settings" className="font-extrabold text-xs rounded-lg gap-1.5">
                <Settings className="w-3.5 h-3.5" /> settings
              </TabsTrigger>
              <TabsTrigger value="students" className="font-extrabold text-xs rounded-lg gap-1.5">
                <Users className="w-3.5 h-3.5" /> Enrolled Students
              </TabsTrigger>
              <TabsTrigger value="teachers" className="font-extrabold text-xs rounded-lg gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> Teachers Directory
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: CAMPUS SETTINGS */}
            <TabsContent value="settings" className="mt-4 space-y-6">
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-600">Campus Name <span className="text-red-500">*</span></Label>
                    <Input placeholder="e.g. Boys Campus" className="rounded-xl" {...editForm.register('name')} />
                    {editForm.formState.errors.name && (
                      <p className="text-[10px] text-red-500 font-bold">{editForm.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-600">Campus Code <span className="text-red-500">*</span></Label>
                    <Input placeholder="e.g. BC" className="rounded-xl uppercase" {...editForm.register('code')} />
                    {editForm.formState.errors.code && (
                      <p className="text-[10px] text-red-500 font-bold">{editForm.formState.errors.code.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-600">Address <span className="text-red-500">*</span></Label>
                  <Input placeholder="123 Main St, Sector-G, Peshawar" className="rounded-xl" {...editForm.register('address')} />
                  {editForm.formState.errors.address && (
                    <p className="text-[10px] text-red-500 font-bold">{editForm.formState.errors.address.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-600">Contact Number <span className="text-red-500">*</span></Label>
                    <Input placeholder="+923001234567" className="rounded-xl" {...editForm.register('phone')} />
                    {editForm.formState.errors.phone && (
                      <p className="text-[10px] text-red-500 font-bold">{editForm.formState.errors.phone.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-600">Email Address <span className="text-red-500">*</span></Label>
                    <Input type="email" placeholder="boys.campus@evershaheen.edu.pk" className="rounded-xl" {...editForm.register('email')} />
                    {editForm.formState.errors.email && (
                      <p className="text-[10px] text-red-500 font-bold">{editForm.formState.errors.email.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-600">Principal Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="Prof. John Doe" className="rounded-xl" {...editForm.register('principalName')} />
                  {editForm.formState.errors.principalName && (
                    <p className="text-[10px] text-red-500 font-bold">{editForm.formState.errors.principalName.message}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="submit" disabled={editMutation.isPending} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                    {editMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>

              {/* Danger Zone Soft Deactivation */}
              {isSuperAdmin && selectedCampus?.isActive && (
                <div className="pt-6 border-t mt-6">
                  <h4 className="text-sm font-black text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Danger Zone
                  </h4>
                  <div className="mt-2 border border-red-100 bg-red-50/50 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="max-w-md">
                      <p className="text-xs font-extrabold text-red-900 leading-snug">Deactivate Campus Branch</p>
                      <p className="text-[11px] text-red-700 mt-1 leading-relaxed">
                        Deactivating this campus prevents registering any new students or classes. Historical audits, existing students, and grades are strictly preserved.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={deleteMutation.isPending}
                      className="rounded-xl border-red-200 text-red-700 hover:bg-red-100/50 hover:text-red-800 font-bold shrink-0 text-xs h-[38px]"
                      onClick={() => {
                        if (confirm(`Are you absolutely sure you want to deactivate ${selectedCampus.name}?`)) {
                          deleteMutation.mutate()
                        }
                      }}
                    >
                      {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Deactivate Campus
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: ENROLLED STUDENTS */}
            <TabsContent value="students" className="mt-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="Search enrolled students..."
                    className="pl-8 h-[36px] text-xs rounded-xl"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value)
                      setStudentPage(1)
                    }}
                  />
                </div>
                {studentsData && (
                  <div className="text-[11px] font-bold text-gray-400">
                    Total Enrolled: <span className="text-indigo-600 font-extrabold">{studentsData.pagination.total}</span>
                  </div>
                )}
              </div>

              {isLoadingStudents ? (
                <div className="space-y-2 pt-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : !studentsData || studentsData.data.length === 0 ? (
                <div className="border border-dashed rounded-2xl p-12 text-center text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 text-indigo-300" />
                  <p className="text-xs font-bold text-gray-500">No students currently enrolled in this branch</p>
                </div>
              ) : (
                <div className="border rounded-2xl overflow-hidden shadow-sm bg-white">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Name</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Reg #</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Grade & Sec</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">B-Form / CNIC</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Fee</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsData.data.map((student: any) => (
                        <TableRow key={student.id} className="hover:bg-gray-50/50">
                          <TableCell className="py-2.5 font-bold text-gray-900 text-xs">
                            {student.firstName} {student.lastName}
                          </TableCell>
                          <TableCell className="py-2.5 text-gray-500 font-mono text-[11px] font-semibold">
                            {student.registrationNumber}
                          </TableCell>
                          <TableCell className="py-2.5 text-gray-600 font-semibold text-xs">
                            {student.class?.name || 'Unassigned'} — {student.section || 'N/A'}
                          </TableCell>
                          <TableCell className="py-2.5 text-gray-500 text-[11px] font-mono font-semibold">
                            {student.cnicBForm}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                                student.feeStatus === 'PAID'
                                  ? 'bg-green-50 text-green-700'
                                  : student.feeStatus === 'PARTIAL'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {student.feeStatus}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right space-x-2">
                            <button
                              type="button"
                              className="text-[11px] font-black text-amber-700 hover:text-amber-900 inline-flex items-center gap-0.5"
                              onClick={() =>
                                setTransferDialog({
                                  entityType: 'STUDENT',
                                  entityId: student.id,
                                  entityLabel: `${student.firstName} ${student.lastName}`,
                                  batchId: student.batchId,
                                })
                              }
                            >
                              <ArrowRightLeft className="w-3 h-3" /> Transfer
                            </button>
                            <Link
                              href={`/dashboard/students/${student.id}`}
                              className="text-[11px] font-black text-indigo-600 hover:text-indigo-800"
                              onClick={() => setIsManageModalOpen(false)}
                            >
                              View →
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  {studentsData.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between p-3 border-t bg-gray-50/30">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={studentPage === 1}
                        onClick={() => setStudentPage((p) => p - 1)}
                        className="h-8 rounded-lg gap-1 border-gray-200 text-xs font-bold text-gray-500"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Previous
                      </Button>
                      <span className="text-[11px] font-bold text-gray-400">
                        Page {studentPage} of {studentsData.pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={studentPage === studentsData.pagination.totalPages}
                        onClick={() => setStudentPage((p) => p + 1)}
                        className="h-8 rounded-lg gap-1 border-gray-200 text-xs font-bold text-gray-500"
                      >
                        Next <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* TAB 3: ENROLLED TEACHERS */}
            <TabsContent value="teachers" className="mt-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="Search teachers by specialty..."
                    className="pl-8 h-[36px] text-xs rounded-xl"
                    value={teacherSearch}
                    onChange={(e) => {
                      setTeacherSearch(e.target.value)
                      setTeacherPage(1)
                    }}
                  />
                </div>
                {teachersData && (
                  <div className="text-[11px] font-bold text-gray-400">
                    Total Instructors: <span className="text-blue-600 font-extrabold">{teachersData.pagination.total}</span>
                  </div>
                )}
              </div>

              {isLoadingTeachers ? (
                <div className="space-y-2 pt-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : !teachersData || teachersData.data.length === 0 ? (
                <div className="border border-dashed rounded-2xl p-12 text-center text-gray-400">
                  <GraduationCap className="w-8 h-8 mx-auto mb-2 text-indigo-300 animate-pulse" />
                  <p className="text-xs font-bold text-gray-500">No teachers assigned to this branch location</p>
                </div>
              ) : (
                <div className="border rounded-2xl overflow-hidden shadow-sm bg-white">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Teacher</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Emp ID</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Designation</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Specialization</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10">Contact</TableHead>
                        <TableHead className="text-xs font-black text-gray-500 uppercase h-10 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teachersData.data.map((teacher: any) => (
                        <TableRow key={teacher.id} className="hover:bg-gray-50/50">
                          <TableCell className="py-2.5 font-bold text-gray-900 text-xs">
                            {teacher.firstName} {teacher.lastName}
                          </TableCell>
                          <TableCell className="py-2.5 text-gray-500 font-mono text-[11px] font-semibold">
                            {teacher.employeeId}
                          </TableCell>
                          <TableCell className="py-2.5 text-gray-600 font-bold text-xs">
                            {teacher.designation || 'Lecturer'}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              {teacher.specialization || 'General Science'}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-gray-500 font-medium text-xs">
                            {teacher.phoneNumber}
                          </TableCell>
                          <TableCell className="py-2.5 text-right space-x-2">
                            <button
                              type="button"
                              className="text-[11px] font-black text-amber-700 hover:text-amber-900 inline-flex items-center gap-0.5"
                              onClick={() =>
                                setTransferDialog({
                                  entityType: 'TEACHER',
                                  entityId: teacher.id,
                                  entityLabel: `${teacher.firstName} ${teacher.lastName}`,
                                  batchId: teacher.batchId,
                                })
                              }
                            >
                              <ArrowRightLeft className="w-3 h-3" /> Transfer
                            </button>
                            <Link
                              href={`/dashboard/teachers/${teacher.id}/edit`}
                              className="text-[11px] font-black text-indigo-600 hover:text-indigo-800"
                              onClick={() => setIsManageModalOpen(false)}
                            >
                              Edit →
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  {teachersData.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between p-3 border-t bg-gray-50/30">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={teacherPage === 1}
                        onClick={() => setTeacherPage((p) => p - 1)}
                        className="h-8 rounded-lg gap-1 border-gray-200 text-xs font-bold text-gray-500"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Previous
                      </Button>
                      <span className="text-[11px] font-bold text-gray-400">
                        Page {teacherPage} of {teachersData.pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={teacherPage === teachersData.pagination.totalPages}
                        onClick={() => setTeacherPage((p) => p + 1)}
                        className="h-8 rounded-lg gap-1 border-gray-200 text-xs font-bold text-gray-500"
                      >
                        Next <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4 pt-3 border-t">
            <Button variant="outline" className="rounded-xl font-bold border-gray-200 text-gray-500" onClick={() => setIsManageModalOpen(false)}>
              Close Panel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {transferDialog && selectedCampus && (
        <TransferEntityDialog
          open={!!transferDialog}
          onOpenChange={(open) => !open && setTransferDialog(null)}
          entityType={transferDialog.entityType}
          entityId={transferDialog.entityId}
          entityLabel={transferDialog.entityLabel}
          currentCampusId={selectedCampus.id}
          currentBatchId={transferDialog.batchId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['campus-students'] })
            queryClient.invalidateQueries({ queryKey: ['campus-teachers'] })
          }}
        />
      )}
    </div>
  )
}
