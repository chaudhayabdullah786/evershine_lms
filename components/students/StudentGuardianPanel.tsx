'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Plus, Loader2, Unlink } from 'lucide-react'
import { notify } from '@/lib/notify'

interface Guardian {
  id: string
  firstName: string
  lastName: string
  cnic: string
  phoneNumber: string
  email?: string
  relationship: string
}

interface Props {
  studentId: string
  guardians: Guardian[]
  canManage?: boolean
}

export function StudentGuardianPanel({ studentId, guardians, canManage = false }: Props) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    cnic: '',
    phoneNumber: '',
    email: '',
    relationship: 'Father',
  })

  const unlinkMutation = useMutation({
    mutationFn: (guardianId: string) =>
      fetchApi(`/api/students/${studentId}/guardians/${guardianId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Guardian unlinked')
      qc.invalidateQueries({ queryKey: ['student', studentId] })
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to unlink'),
  })

  const linkMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/students/${studentId}/guardians`, {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      notify.success('Guardian linked')
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      setShowForm(false)
      setForm({ firstName: '', lastName: '', cnic: '', phoneNumber: '', email: '', relationship: 'Father' })
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to link guardian'),
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Guardians / Parents
            </CardTitle>
            <CardDescription className="text-xs">
              Portal login for fee proofs and child academic view.
            </CardDescription>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={() => setShowForm((v) => !v)}>
              <Plus className="w-3.5 h-3.5" />
              Link guardian
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {guardians.length === 0 && !showForm && (
          <p className="text-xs text-gray-500">No guardians linked yet.</p>
        )}
        {guardians.map((g) => (
          <div key={g.id} className="p-3 rounded-lg border bg-gray-50/80 flex justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {g.firstName} {g.lastName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {g.relationship} · CNIC {g.cnic} · {g.phoneNumber}
              </p>
              {g.email && <p className="text-xs text-gray-400">{g.email}</p>}
            </div>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 h-8 px-2"
                disabled={unlinkMutation.isPending}
                onClick={() => {
                  if (!confirm(`Unlink ${g.firstName} ${g.lastName} from this student?`)) return
                  unlinkMutation.mutate(g.id)
                }}
              >
                <Unlink className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}

        {showForm && canManage && (
          <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/40 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">First name</Label>
                <Input className="h-9 text-sm bg-white" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last name</Label>
                <Input className="h-9 text-sm bg-white" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">CNIC (13 digits)</Label>
                <Input className="h-9 text-sm bg-white font-mono" maxLength={13} value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input className="h-9 text-sm bg-white" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Email (optional)</Label>
                <Input type="email" className="h-9 text-sm bg-white" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Relationship</Label>
                <Input className="h-9 text-sm bg-white" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!form.firstName || form.cnic.length !== 13 || !form.phoneNumber || linkMutation.isPending}
              onClick={() => linkMutation.mutate()}
            >
              {linkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & link guardian'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
