'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft, GraduationCap, Users, Home, BookOpen,
  Plus, Pencil, Trash2, AlertTriangle, Loader2,
} from 'lucide-react'
import { AccessDenied } from '@/components/AccessDenied'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'

export default function BatchManagePage() {
  const { id } = useParams<{ id: string }>()
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const router = useRouter()

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

  // ── Danger Zone state ─────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createHouseMutation = useMutation({
    mutationFn: async (payload: any) =>
      fetchApi('/api/houses', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-houses', id] })
      queryClient.invalidateQueries({ queryKey: ['batch-detail', id] })
      setIsHouseModalOpen(false)
      setHouseForm({ name: '', color: '#1D4ED8', motto: '' })
    },
    onError: (err: any) => notify.error(err?.message || 'Failed to create house'),
  })

  const updateHouseMutation = useMutation({
    mutationFn: async (payload: any) =>
      fetchApi(`/api/houses/${payload.id}`, { method: 'PATCH', body: JSON.stringify(payload.data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-houses', id] })
      queryClient.invalidateQueries({ queryKey: ['batch-detail', id] })
      setIsHouseModalOpen(false)
      setEditingHouse(null)
      setHouseForm({ name: '', color: '#1D4ED8', motto: '' })
    },
    onError: (err: any) => notify.error(err?.message || 'Failed to update house'),
  })

  const deleteHouseMutation = useMutation({
    mutationFn: async (houseId: string) =>
      fetchApi(`/api/houses/${houseId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-houses', id] })
      queryClient.invalidateQueries({ queryKey: ['batch-detail', id] })
    },
    onError: (err: any) => notify.error(err?.message || 'Failed to delete house'),
  })

  /**
   * WHY soft-delete only: We set isActive=false rather than cascade-deleting
   * rows. Students, grades, attendance, and audit records must be preserved
   * for regulatory/reporting purposes even after a batch is retired.
   * The API enforces SUPER_ADMIN-only at the route level (line 91 of route.ts).
   */
  const deleteBatchMutation = useMutation({
    mutationFn: async () =>
      fetchApi(`/api/batches/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success(`Batch "${batch?.name}" has been deactivated.`)
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      router.push('/dashboard/batches')
    },
    onError: (err: any) =>
      notify.error(err?.message || 'Failed to deactivate batch. Check console for details.'),
  })

  // ── Derived values ────────────────────────────────────────────────────────
  const classes = classesData?.data ?? []
  const houses = Array.isArray(housesData) ? housesData : []
  const students = studentsData?.data ?? []
  const teachers = teachersData?.data ?? []
  const activeStudentCount = studentsData?.pagination?.total ?? 0
  const activeClassCount = classes.length
  const canConfirmDelete = confirmName.trim() === batch?.name

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  // ── Loading / not-found states ────────────────────────────────────────────
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
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/batches">
            <ArrowLeft className="w-4 h-4 mr-1" /> Batches
          </Link>
        </Button>
      </div>

      {/* Batch header */}
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-gray-900">{batch.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {batch.campus?.name} · {batch.academicLevel} · Code {batch.code}
            </p>
          </div>
          {!batch.isActive && (
            <span className="text-xs px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold shrink-0">
              DEACTIVATED
            </span>
          )}
        </div>
        {batch.isActive && (
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
        )}
      </div>

      {/* Content grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Classes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Classes ({activeClassCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400">No classes — create under Classes module.</p>
            ) : (
              classes.map((c: { id: string; name: string; shift: string }) => (
                <div key={c.id} className="flex justify-between text-sm border-b pb-2">
                  <span>{c.name} · {c.shift}</span>
                  <Link href="/dashboard/classes" className="text-indigo-600 text-xs font-bold">
                    Manage
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Houses */}
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
            {batch.isActive && (
              <Button size="sm" variant="outline" onClick={() => openHouseForm()}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {houses.length === 0 ? (
              <p className="text-xs text-gray-400">No houses configured for this batch.</p>
            ) : (
              houses.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
                    <div>
                      <p className="font-semibold text-slate-900">{h.name}</p>
                      {h.motto && <p className="text-[11px] text-slate-500">{h.motto}</p>}
                    </div>
                  </div>
                  {batch.isActive && (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openHouseForm(h)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => removeHouse(h.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Students */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Students ({activeStudentCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {students.length === 0 ? (
              <p className="text-xs text-gray-400">No students in this batch yet.</p>
            ) : (
              students.map((s: { id: string; firstName: string; lastName: string }) => (
                <Link key={s.id} href={`/dashboard/students/${s.id}`} className="block text-sm text-indigo-600 hover:underline">
                  {s.firstName} {s.lastName}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Teachers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Teachers ({teachersData?.pagination?.total ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {teachers.length === 0 ? (
              <p className="text-xs text-gray-400">No teachers assigned to this batch yet.</p>
            ) : (
              teachers.map((t: { id: string; firstName: string; lastName: string }) => (
                <Link key={t.id} href={`/dashboard/teachers/${t.id}/edit`} className="block text-sm text-indigo-600 hover:underline">
                  {t.firstName} {t.lastName}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Danger Zone — SUPER_ADMIN only, active batches only ───────────── */}
      {role === 'SUPER_ADMIN' && batch.isActive && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-xs font-black text-red-700 uppercase tracking-widest">Danger Zone</h3>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-xl border border-red-100 p-4">
            <div className="space-y-1 max-w-lg">
              <p className="text-sm font-bold text-red-900">Deactivate this batch</p>
              <p className="text-xs text-red-700 leading-relaxed">
                This batch has{' '}
                <span className="font-black">{activeStudentCount} student{activeStudentCount !== 1 ? 's' : ''}</span>
                {' '}and{' '}
                <span className="font-black">{activeClassCount} class{activeClassCount !== 1 ? 'es' : ''}</span>.
                Deactivating blocks new registrations and class creation.
                All historical records, grades, fees, and audit logs are fully preserved.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-900 font-bold shrink-0 h-9 gap-1.5"
              onClick={() => { setConfirmName(''); setShowDeleteConfirm(true) }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Deactivate batch
            </Button>
          </div>
        </div>
      )}

      {/* ── Typed Confirmation Dialog ─────────────────────────────────────── */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => { setShowDeleteConfirm(open); if (!open) setConfirmName('') }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Confirm batch deactivation
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Impact summary */}
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 space-y-1.5">
              <p><span className="font-black">Batch:</span> {batch.name}</p>
              <p><span className="font-black">Campus:</span> {batch.campus?.name}</p>
              <p><span className="font-black">Active students:</span> {activeStudentCount}</p>
              <p><span className="font-black">Classes:</span> {activeClassCount}</p>
            </div>

            {/* Typed confirmation */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-batch-name" className="text-sm font-semibold text-gray-700">
                Type <code className="font-black text-red-700 bg-red-50 px-1 rounded">{batch.name}</code> to confirm
              </Label>
              <Input
                id="confirm-batch-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={batch.name}
                autoComplete="off"
                className={`font-mono transition-colors ${
                  canConfirmDelete
                    ? 'border-green-500 focus-visible:ring-green-400'
                    : confirmName.length > 0
                    ? 'border-red-300'
                    : ''
                }`}
              />
              {confirmName.length > 0 && !canConfirmDelete && (
                <p className="text-xs text-red-600">Name does not match — check capitalisation.</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { setShowDeleteConfirm(false); setConfirmName('') }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canConfirmDelete || deleteBatchMutation.isPending}
              onClick={() => deleteBatchMutation.mutate()}
              className="gap-2"
            >
              {deleteBatchMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Deactivating…</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Deactivate permanently</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── House Create/Edit Modal ───────────────────────────────────────── */}
      <Dialog open={isHouseModalOpen} onOpenChange={setIsHouseModalOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingHouse ? 'Edit house' : 'Add house'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={houseForm.name}
                onChange={(e) => setHouseForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Blue House"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={houseForm.color}
                  onChange={(e) => setHouseForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-16 cursor-pointer rounded-lg border p-0.5"
                />
                <span className="text-sm font-mono text-gray-500">{houseForm.color}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motto <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Input
                value={houseForm.motto}
                onChange={(e) => setHouseForm((f) => ({ ...f, motto: e.target.value }))}
                placeholder="e.g. Courage and Honour"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHouseModalOpen(false)}>Cancel</Button>
            <Button
              onClick={submitHouse}
              disabled={!houseForm.name || createHouseMutation.isPending || updateHouseMutation.isPending}
            >
              {(createHouseMutation.isPending || updateHouseMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                editingHouse ? 'Save changes' : 'Add house'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
