'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, GraduationCap, Users, Home, BookOpen, Plus, Pencil, Trash2 } from 'lucide-react'
import { AccessDenied } from '@/components/AccessDenied'
import { useSession } from 'next-auth/react'

export default function BatchManagePage() {
  const { id } = useParams<{ id: string }>()
  const { data: session, status } = useSession()
  const role = session?.user?.role

  if (status === 'loading') return null
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <AccessDenied title="Restricted" message="Batch management is for administrators only." />
  }

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch-detail', id],
    queryFn: () => fetchApi<any>(`/api/batches/${id}`),
    enabled: !!id,
  })

  const { data: classesData } = useQuery({
    queryKey: ['batch-classes', id],
    queryFn: () => fetchPaginatedApi<any>(`/api/classes?batchId=${id}&limit=100`),
    enabled: !!id,
  })

  const { data: housesData } = useQuery({
    queryKey: ['batch-houses', id],
    queryFn: () => fetchApi<any[]>(`/api/houses?batchId=${id}`),
    enabled: !!id,
  })

  const { data: studentsData } = useQuery({
    queryKey: ['batch-students', id],
    queryFn: () => fetchPaginatedApi<any>(`/api/students?batchId=${id}&limit=10`),
    enabled: !!id,
  })

  const { data: teachersData } = useQuery({
    queryKey: ['batch-teachers', id],
    queryFn: () => fetchPaginatedApi<any>(`/api/teachers?batchId=${id}&limit=10`),
    enabled: !!id,
  })

  const queryClient = useQueryClient()
  const [isHouseModalOpen, setIsHouseModalOpen] = useState(false)
  const [editingHouse, setEditingHouse] = useState<any | null>(null)
  const [houseForm, setHouseForm] = useState({ name: '', color: '#1D4ED8', motto: '' })

  const createHouseMutation = useMutation({
    mutationFn: async (payload: any) => {
      return fetchApi('/api/houses', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-houses', id] })
      queryClient.invalidateQueries({ queryKey: ['batch-detail', id] })
      setIsHouseModalOpen(false)
      setHouseForm({ name: '', color: '#1D4ED8', motto: '' })
    },
    onError: (err: any) => {
      console.error(err)
    },
  })

  const updateHouseMutation = useMutation({
    mutationFn: async (payload: any) => {
      return fetchApi(`/api/houses/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-houses', id] })
      queryClient.invalidateQueries({ queryKey: ['batch-detail', id] })
      setIsHouseModalOpen(false)
      setEditingHouse(null)
      setHouseForm({ name: '', color: '#1D4ED8', motto: '' })
    },
    onError: (err: any) => {
      console.error(err)
    },
  })

  const deleteHouseMutation = useMutation({
    mutationFn: async (houseId: string) => {
      return fetchApi(`/api/houses/${houseId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-houses', id] })
      queryClient.invalidateQueries({ queryKey: ['batch-detail', id] })
    },
    onError: (err: any) => {
      console.error(err)
    },
  })

  const classes = classesData?.data ?? []
  const houses = housesData ?? []
  const students = studentsData?.data ?? []
  const teachers = teachersData?.data ?? []

  const openHouseForm = (house?: any) => {
    if (house) {
      setEditingHouse(house)
      setHouseForm({ name: house.name, color: house.color, motto: house.motto ?? '' })
    } else {
      setEditingHouse(null)
      setHouseForm({ name: '', color: '#1D4ED8', motto: '' })
    }
    setIsHouseModalOpen(true)
  }

  const submitHouse = async () => {
    const payload = { ...houseForm, batchId: id }
    if (editingHouse) {
      await updateHouseMutation.mutateAsync({ id: editingHouse.id, data: payload })
    } else {
      await createHouseMutation.mutateAsync(payload)
    }
  }

  const removeHouse = async (houseId: string) => {
    if (!window.confirm('Delete this house? This cannot be undone.')) return
    await deleteHouseMutation.mutateAsync(houseId)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Batch not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link href="/dashboard/batches">Back to batches</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/batches">
            <ArrowLeft className="w-4 h-4 mr-1" /> Batches
          </Link>
        </Button>
      </div>

      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-black text-gray-900">{batch.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {batch.campus?.name} · {batch.academicLevel} · Code {batch.code}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button size="sm" asChild>
            <Link href={`/dashboard/classes?campus=${batch.campusId}&batch=${id}`}>
              <Plus className="w-4 h-4 mr-1" /> Add class
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/teachers/new">Add teacher</Link>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Classes ({classes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400">No classes — create under Classes module.</p>
            ) : (
              classes.map((c: { id: string; name: string; shift: string }) => (
                <div key={c.id} className="flex justify-between text-sm border-b pb-2">
                  <span>{c.name} · {c.shift}</span>
                  <Link href={`/dashboard/classes`} className="text-indigo-600 text-xs font-bold">
                    Manage
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="w-4 h-4" /> Performance houses ({houses.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Required for Matric / Intermediate student & teacher placement.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => openHouseForm()}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {houses.length === 0 ? (
              <p className="text-xs text-gray-400">No houses configured for this batch.</p>
            ) : (
              houses.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color }} />
                    <div>
                      <p className="font-semibold text-slate-900">{h.name}</p>
                      {h.motto && <p className="text-[11px] text-slate-500">{h.motto}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" onClick={() => openHouseForm(h)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeHouse(h.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Students ({studentsData?.pagination?.total ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {students.map((s: { id: string; firstName: string; lastName: string }) => (
              <Link key={s.id} href={`/dashboard/students/${s.id}`} className="block text-sm text-indigo-600">
                {s.firstName} {s.lastName}
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Teachers ({teachersData?.pagination?.total ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {teachers.map((t: { id: string; firstName: string; lastName: string }) => (
              <Link key={t.id} href={`/dashboard/teachers/${t.id}/edit`} className="block text-sm text-indigo-600">
                {t.firstName} {t.lastName}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
