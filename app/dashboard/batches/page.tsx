'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Users, Search, Loader2, Settings } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import { AccessDenied } from '@/components/AccessDenied'

const createBatchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters").max(5),
  campusId: z.string().min(1, "Campus is required"),
  academicLevel: z.enum(['PreSchool', 'Elementary', 'Secondary', 'HigherSecondary']),
  description: z.string().optional(),
})

type CreateBatchForm = z.infer<typeof createBatchSchema>

export default function BatchesPage() {
  const { data: session, status } = useSession()
  const userRole = session?.user?.role as string | undefined

  const [search, setSearch] = useState('')
  const [selectedCampus, setSelectedCampus] = useState('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const queryClient = useQueryClient()

  // Route guard: batch management is restricted to administrators
  if (status === 'loading') return null
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return (
      <AccessDenied
        title="Batch Management Restricted"
        message="Academic batch management is restricted to administrators."
      />
    )
  }

  // Queries
  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchPaginatedApi<any>('/api/campuses?limit=50'),
  })

  const { data: batchesData, isLoading } = useQuery({
    queryKey: ['batches', search, selectedCampus],
    queryFn: () => {
      let url = `/api/batches?search=${search}&limit=50`
      if (selectedCampus !== 'ALL') url += `&campusId=${selectedCampus}`
      return fetchPaginatedApi<any>(url)
    },
  })

  const campuses = campusesData?.data ?? []
  const batches = batchesData?.data ?? []

  // Form setup
  const form = useForm<CreateBatchForm>({
    resolver: zodResolver(createBatchSchema),
    defaultValues: {
      name: '',
      code: '',
      campusId: '',
      academicLevel: 'Secondary',
      forceGenderSeparation: true,
      description: ''
    }
  })

  const academicLevel = form.watch('academicLevel')

  useEffect(() => {
    if (academicLevel === 'Secondary' || academicLevel === 'HigherSecondary') {
      form.setValue('forceGenderSeparation', true)
    } else {
      form.setValue('forceGenderSeparation', false)
    }
  }, [academicLevel, form])

  // Mutation
  const createMutation = useMutation({
    mutationFn: async (values: CreateBatchForm) => {
      return fetchApi('/api/batches', {
        method: 'POST',
        body: JSON.stringify(values)
      })
    },
    onSuccess: () => {
      notify.success('Batch created successfully!')
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      setIsModalOpen(false)
      form.reset()
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to create batch')
    }
  })

  const onSubmit = (values: CreateBatchForm) => {
    createMutation.mutate(values)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Batches Management</h1>
          <p className="text-sm text-gray-500">Manage academic batches and groups across campuses.</p>
        </div>
        <Button className="gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" /> Add Batch
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search batches..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={selectedCampus} onValueChange={setSelectedCampus}>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
        ) : batches.length === 0 ? (
          <div className="col-span-full bg-white border rounded-xl p-16 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">No batches found</p>
          </div>
        ) : (
          batches.map((batch: any) => (
            <Card key={batch.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 border-b bg-gray-50/50 rounded-t-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg text-blue-900">{batch.name}</CardTitle>
                    <CardDescription className="text-xs mt-1 font-semibold text-blue-600">
                      {batch.campus?.name || 'Unknown Campus'}
                    </CardDescription>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700">
                    {batch.academicLevel}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs text-center border-t border-b py-2">
                  <div>
                    <p className="text-gray-400 font-medium mb-0.5">Classes</p>
                    <p className="font-bold text-gray-900">{batch._count?.classes || 0}</p>
                  </div>
                  <div className="border-l border-r">
                    <p className="text-gray-400 font-medium mb-0.5">Students</p>
                    <p className="font-bold text-gray-900">{batch._count?.students || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 font-medium mb-0.5">Houses</p>
                    <p className="font-bold text-gray-900">{batch._count?.houses || 0}</p>
                  </div>
                </div>
                <p className="text-xs font-medium text-slate-600">
                  {batch.forceGenderSeparation ? 'Gender-separated placement' : 'Coeducational placement by default'}
                </p>
                {batch.description && (
                  <p className="text-xs text-gray-500 line-clamp-2">{batch.description}</p>
                )}
                <div className="pt-1">
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" asChild>
                    <Link href={`/dashboard/batches/${batch.id}`}>
                      <Settings className="w-3.5 h-3.5" /> Manage batch hub
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Batch</DialogTitle>
            <DialogDescription>
              Create a new batch or academic grouping (e.g., "Matriculation 2026").
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            
            <div className="space-y-2">
              <Label>Campus *</Label>
              <Controller
                control={form.control}
                name="campusId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {campuses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.campusId && <p className="text-xs text-red-500">{form.formState.errors.campusId.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Batch Name *</Label>
                <Input placeholder="e.g. Matriculation 2026" {...form.register('name')} />
                {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Batch Code *</Label>
                <Input placeholder="e.g. MAT26" {...form.register('code')} />
                {form.formState.errors.code && <p className="text-xs text-red-500">{form.formState.errors.code.message}</p>}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Academic Level *</Label>
              <Controller
                control={form.control}
                name="academicLevel"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select academic level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PreSchool">PreSchool</SelectItem>
                      <SelectItem value="Elementary">Elementary (Primary/Middle)</SelectItem>
                      <SelectItem value="Secondary">Secondary (Matriculation)</SelectItem>
                      <SelectItem value="HigherSecondary">Higher Secondary (Intermediate)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.academicLevel && <p className="text-xs text-red-500">{form.formState.errors.academicLevel.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="forceGenderSeparation"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                  )}
                />
                <Label className="font-semibold">Enforce gender-separated placement</Label>
              </div>
              <p className="text-xs text-gray-500">
                Secondary and Higher Secondary batches are separated by gender by default; lower grades remain coeducational unless explicitly overridden.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Optional description..." {...form.register('description')} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-blue-600">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Batch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
