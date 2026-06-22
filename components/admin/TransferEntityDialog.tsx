'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { ArrowRightLeft, Loader2 } from 'lucide-react'

export type TransferEntityType = 'STUDENT' | 'TEACHER' | 'CLASS'

export interface TransferEntityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: TransferEntityType
  entityId: string
  entityLabel: string
  currentCampusId?: string
  currentBatchId?: string
  onSuccess?: () => void
}

export function TransferEntityDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityLabel,
  currentCampusId,
  currentBatchId,
  onSuccess,
}: TransferEntityDialogProps) {
  const queryClient = useQueryClient()
  const [targetCampusId, setTargetCampusId] = useState(currentCampusId ?? '')
  const [targetBatchId, setTargetBatchId] = useState(currentBatchId ?? '')
  const [targetClassId, setTargetClassId] = useState('')
  const [targetHouseId, setTargetHouseId] = useState('')

  const { data: campusesData } = useQuery({
    queryKey: ['campuses-transfer'],
    queryFn: () => fetchPaginatedApi<{ id: string; name: string }>('/api/campuses?limit=50'),
    enabled: open,
  })
  const campuses = campusesData?.data ?? []

  const { data: batchesData } = useQuery({
    queryKey: ['batches-transfer', targetCampusId],
    queryFn: () => fetchPaginatedApi<{ id: string; name: string }>(`/api/batches?campusId=${targetCampusId}&limit=50`),
    enabled: open && !!targetCampusId,
  })
  const batches = batchesData?.data ?? []

  const { data: classesData } = useQuery({
    queryKey: ['classes-transfer', targetCampusId, targetBatchId],
    queryFn: () =>
      fetchPaginatedApi<{ id: string; name: string }>(
        `/api/classes?campusId=${targetCampusId}&batchId=${targetBatchId}&limit=100`
      ),
    enabled: open && entityType === 'STUDENT' && !!targetCampusId && !!targetBatchId,
  })
  const classes = classesData?.data ?? []

  const { data: housesData } = useQuery({
    queryKey: ['houses-transfer', targetBatchId],
    queryFn: () => fetchApi<{ id: string; name: string }[]>(`/api/houses?batchId=${targetBatchId}`),
    enabled: open && entityType !== 'CLASS' && !!targetBatchId,
  })
  const houses = housesData ?? []

  const mutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/admin/transfers', {
        method: 'POST',
        body: JSON.stringify({
          entityType,
          entityId,
          targetCampusId: targetCampusId || undefined,
          targetBatchId: targetBatchId || undefined,
          targetClassId: entityType === 'STUDENT' && targetClassId ? targetClassId : undefined,
          targetHouseId:
            entityType !== 'CLASS' && targetHouseId ? targetHouseId : undefined,
          notifyUser: true,
        }),
      }),
    onSuccess: () => {
      notify.success(`${entityLabel} transferred successfully`)
      queryClient.invalidateQueries({ queryKey: ['campus-students'] })
      queryClient.invalidateQueries({ queryKey: ['campus-teachers'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      onSuccess?.()
      onOpenChange(false)
    },
    onError: (err: Error) => {
      notify.error('Transfer failed', { description: err.message })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
            Transfer {entityType === 'STUDENT' ? 'Student' : entityType === 'TEACHER' ? 'Teacher' : 'Class'}
          </DialogTitle>
          <DialogDescription>
            Move <strong>{entityLabel}</strong> to another campus, batch, or {entityType === 'STUDENT' ? 'class' : 'house'}.
            The user will receive an in-app notification when applicable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Target campus</Label>
            <Select
              value={targetCampusId || undefined}
              onValueChange={(v) => {
                setTargetCampusId(v)
                setTargetBatchId('')
                setTargetClassId('')
                setTargetHouseId('')
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Target batch</Label>
            <Select
              value={targetBatchId || undefined}
              disabled={!targetCampusId}
              onValueChange={(v) => {
                setTargetBatchId(v)
                setTargetClassId('')
                setTargetHouseId('')
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={targetCampusId ? 'Select batch' : 'Select campus first'} />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {entityType === 'STUDENT' && (
            <div className="space-y-1.5">
              <Label>Target class (optional)</Label>
              <Select
                value={targetClassId || undefined}
                disabled={!targetBatchId}
                onValueChange={setTargetClassId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {entityType !== 'CLASS' && houses.length > 0 && (
            <div className="space-y-1.5">
              <Label>Performance house (optional)</Label>
              <Select value={targetHouseId || undefined} onValueChange={setTargetHouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select house" />
                </SelectTrigger>
                <SelectContent>
                  {houses.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !targetCampusId}
            className="gap-2"
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Transferring…</>
            ) : (
              'Confirm transfer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
