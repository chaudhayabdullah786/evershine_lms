'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAcademicEnginePrimary } from '@/lib/academic/config'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, GraduationCap, Search, Loader2, Filter, ArrowRightLeft, Trash2 } from 'lucide-react'
import { TransferEntityDialog } from '@/components/admin/TransferEntityDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import { AccessDenied } from '@/components/AccessDenied'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'

const createClassSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  grade: z.coerce.number().int().min(1).max(14),
  section: z.string().max(3).optional().default(''),
  shift: z.enum(['MORNING', 'EVENING']).default('MORNING'),
  campusId: z.string().min(1, "Campus is required"),
  batchId: z.string().min(1, "Batch is required"),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, "Format: YYYY-YYYY"),
  capacity: z.coerce.number().int().min(1).max(100).default(40),
  roomNumber: z.string().optional(),
})

type CreateClassForm = z.infer<typeof createClassSchema>

export default function ClassesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const userRole = session?.user?.role as string | undefined

  useEffect(() => {
    if (status !== 'authenticated' || !isAcademicEnginePrimary()) return
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      router.replace('/dashboard/academic?tab=sections')
    }
  }, [status, userRole, router])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filterCampus, setFilterCampus] = useState('ALL')
  const [filterBatch, setFilterBatch] = useState('ALL')
  const [filterShift, setFilterShift] = useState<'ALL' | SessionShift>('ALL')
  const [transferClass, setTransferClass] = useState<{
    id: string
    name: string
    campusId: string
    batchId?: string
  } | null>(null)

  const queryClient = useQueryClient()

  // Route guard: class management is restricted to administrators
  if (status === 'loading') return null
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return (
      <AccessDenied
        title="Class Management Restricted"
        message="Defining and managing class sections is restricted to administrators."
      />
    )
  }

  // Queries
  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchPaginatedApi<any>('/api/campuses?limit=50'),
  })

  const { data: batchesData } = useQuery({
    queryKey: ['batches', filterCampus],
    queryFn: () => {
      let url = '/api/batches?limit=100'
      if (filterCampus !== 'ALL') url += `&campusId=${filterCampus}`
      return fetchPaginatedApi<any>(url)
    }
  })

  const { data: classesData, isLoading } = useQuery({
    queryKey: ['classes', filterCampus, filterBatch, filterShift],
    queryFn: () => {
      let url = '/api/classes?limit=100'
      if (filterCampus !== 'ALL') url += `&campusId=${filterCampus}`
      if (filterBatch !== 'ALL') url += `&batchId=${filterBatch}`
      if (filterShift !== 'ALL') url += `&shift=${filterShift}`
      return fetchPaginatedApi<any>(url)
    }
  })

  const campuses = campusesData?.data ?? []
  const batches = batchesData?.data ?? []
  const classes = classesData?.data ?? []

  // Form setup
  const form = useForm<CreateClassForm>({
    resolver: zodResolver(createClassSchema),
    defaultValues: { 
      name: '', 
      grade: 1, 
      section: 'A',
      shift: 'MORNING',
      campusId: '', 
      batchId: '', 
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, 
      capacity: 40,
      roomNumber: ''
    }
  })

  // Watch campusId to filter batches in modal
  const modalCampusId = form.watch('campusId')
  const modalBatches = batches.filter((b: any) => !modalCampusId || b.campusId === modalCampusId)

  // Mutation
  const createMutation = useMutation({
    mutationFn: async (values: CreateClassForm) => {
      return fetchApi('/api/classes', {
        method: 'POST',
        body: JSON.stringify(values)
      })
    },
    onSuccess: () => {
      notify.success('Class created successfully!')
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      setIsModalOpen(false)
      form.reset()
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to create class')
    }
  })

  const onSubmit = (values: CreateClassForm) => {
    createMutation.mutate(values)
  }

  const deactivateClass = async (classId: string, className: string) => {
    if (!confirm(`Deactivate ${className}? Students will remain but the class will be hidden from active lists.`)) return
    try {
      await fetchApi(`/api/classes/${classId}`, { method: 'DELETE' })
      notify.success('Class deactivated')
      queryClient.invalidateQueries({ queryKey: ['classes'] })
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : 'Failed to deactivate class', { id: 'class-deactivate-err' })
    }
  }

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-6 max-w-7xl mx-auto">
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <GraduationCap className="w-6 h-6" />
            </div>
            Classes Management
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">Define sections and rooms for your academic batches.</p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" /> Add Class
        </Button>
      </motion.div>

      <motion.div variants={fadeUp(0.2)} className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200/60 shadow-soft-md">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mr-2">
          <Filter className="w-4 h-4" /> Filters:
        </div>
        <Select value={filterCampus} onValueChange={(val) => { setFilterCampus(val); setFilterBatch('ALL'); }}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by Campus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Campuses</SelectItem>
            {campuses.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterBatch} onValueChange={setFilterBatch} disabled={filterCampus === 'ALL'}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Batches</SelectItem>
            {batches.map((b: any) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterShift} onValueChange={(v) => setFilterShift(v as 'ALL' | SessionShift)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Session" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sessions</SelectItem>
            <SelectItem value="MORNING">{SESSION_SHIFT_LABELS.MORNING}</SelectItem>
            <SelectItem value="EVENING">{SESSION_SHIFT_LABELS.EVENING}</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      <motion.div variants={fadeUp(0.3)} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)
        ) : classes.length === 0 ? (
          <div className="col-span-full">
            <EmptyState 
              icon={GraduationCap}
              title="No classes found"
              description="No classes match the selected filters. Try adjusting your search criteria."
            />
          </div>
        ) : (
          classes.map((cls: any) => (
            <Card key={cls.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 border-b bg-gray-50/50 rounded-t-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg text-blue-900">{cls.name}</CardTitle>
                    <CardDescription className="text-xs mt-1 font-semibold text-blue-600">
                      Batch: {cls.batch?.name} | {cls.campus?.name}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${SESSION_SHIFT_BADGE_CLASS[cls.shift as SessionShift] ?? SESSION_SHIFT_BADGE_CLASS.MORNING}`}>
                      {cls.shift === 'EVENING' ? 'Evening' : 'Morning'}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700">
                      GRADE {cls.grade}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400">Section</p>
                    <p className="font-bold text-gray-900">{cls.section || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-xs text-gray-400">Capacity</p>
                    <p className="font-bold text-gray-900">{cls._count?.students || 0} / {cls.capacity}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs text-gray-400">Room</p>
                    <p className="font-bold text-gray-900">{cls.roomNumber || 'TBD'}</p>
                  </div>
                </div>
                
                <div className="pt-2 border-t flex flex-wrap gap-2 justify-between items-center">
                   <p className="text-[10px] text-gray-400 font-medium">{cls.academicYear}</p>
                   <div className="flex gap-1">
                     <Button
                       variant="ghost"
                       size="sm"
                       className="h-7 text-[10px] px-2 text-amber-700"
                       onClick={() =>
                         setTransferClass({
                           id: cls.id,
                           name: cls.name,
                           campusId: cls.campusId,
                           batchId: cls.batchId,
                         })
                       }
                     >
                       <ArrowRightLeft className="w-3 h-3 mr-0.5" /> Shift
                     </Button>
                     <Button
                       variant="ghost"
                       size="sm"
                       className="h-7 text-[10px] px-2 text-red-600"
                       onClick={() => deactivateClass(cls.id, cls.name)}
                     >
                       <Trash2 className="w-3 h-3" />
                     </Button>
                   </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </motion.div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Class</DialogTitle>
            <DialogDescription>
              Define a specific classroom/section for a batch.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campus *</Label>
                <Controller
                  control={form.control}
                  name="campusId"
                  render={({ field }) => (
                    <Select onValueChange={(val) => { field.onChange(val); form.setValue('batchId', ''); }} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select campus" />
                      </SelectTrigger>
                      <SelectContent>
                        {campuses.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Batch *</Label>
                <Controller
                  control={form.control}
                  name="batchId"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value} disabled={!modalCampusId}>
                      <SelectTrigger>
                        <SelectValue placeholder={!modalCampusId ? "Select Campus first" : "Select batch"} />
                      </SelectTrigger>
                      <SelectContent>
                        {modalBatches.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
               <div className="space-y-2 col-span-2">
                  <Label>Class/Display Name *</Label>
                  <Input placeholder="e.g. 9th-A-Matric" {...form.register('name')} />
               </div>
               <div className="space-y-2">
                  <Label>Grade (1-14) *</Label>
                  <Input type="number" {...form.register('grade')} />
               </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Section</Label>
                <Input placeholder="e.g. A" {...form.register('section')} />
              </div>
              <div className="space-y-2">
                <Label>Capacity *</Label>
                <Input type="number" {...form.register('capacity')} />
              </div>
              <div className="space-y-2">
                <Label>Academic Year *</Label>
                <Input placeholder="2025-2026" {...form.register('academicYear')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Session Shift *</Label>
              <Controller
                control={form.control}
                name="shift"
                render={({ field }) => (
                  <div className="flex gap-4">
                    {(['MORNING', 'EVENING'] as const).map((s) => (
                      <label
                        key={s}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          field.value === s
                            ? s === 'MORNING'
                              ? 'border-amber-400 bg-amber-50 text-amber-900'
                              : 'border-indigo-400 bg-indigo-50 text-indigo-900'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          checked={field.value === s}
                          onChange={() => field.onChange(s)}
                        />
                        <span className="text-sm font-semibold">{SESSION_SHIFT_LABELS[s]}</span>
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Room Number / Location</Label>
              <Input placeholder="Room 101, Floor 2" {...form.register('roomNumber')} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-blue-600">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Class
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {transferClass && (
        <TransferEntityDialog
          open={!!transferClass}
          onOpenChange={(o) => !o && setTransferClass(null)}
          entityType="CLASS"
          entityId={transferClass.id}
          entityLabel={transferClass.name}
          currentCampusId={transferClass.campusId}
          currentBatchId={transferClass.batchId}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['classes'] })}
        />
      )}
    </motion.div>
  )
}
