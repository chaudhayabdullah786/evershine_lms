'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { notify } from '@/lib/notify'
import {
  Megaphone, Clock, Users, Pencil, Trash2, MoreHorizontal, Save,
} from 'lucide-react'
import { useSession } from 'next-auth/react'

interface Announcement {
  id: string
  title: string
  content: string
  classId: string
  class?: { name: string; section: string }
  isActive: boolean
  publishedAt: string
  expiresAt: string | null
}

interface ClassRecord {
  id: string
  name: string
  section: string
  classSectionId?: string | null
  legacyClassId?: string | null
  shift?: string
}

interface ApiError {
  message?: string
}

export default function TeacherAnnouncementsPage() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'

  const [formData, setFormData] = useState({
    title: '', content: '', classId: '', expiresAt: ''
  })
  const [editAnn, setEditAnn] = useState<Announcement | null>(null)
  const [deleteAnn, setDeleteAnn] = useState<Announcement | null>(null)

  // Fetch ONLY assigned classes for teacher
  const { data: classesRaw, isLoading: classesLoading } = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => fetchApi<ClassRecord[]>('/api/teacher-portal/classes'),
    enabled: isTeacher,
    staleTime: 5 * 60 * 1000,
  })
  const classes = Array.isArray(classesRaw) ? classesRaw : (classesRaw as any)?.data ?? []
  const classOptions = classes.map((item: ClassRecord, idx: number) => ({
    value: item.classSectionId ?? item.legacyClassId ?? item.id ?? `class-${idx}`,
    label: `${item.name} (${item.section || 'N/A'})`,
    raw: item,
  }))

  // Fetch announcements
  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['teacher-announcements'],
    queryFn: () => fetchApi<Announcement[]>('/api/teacher-portal/announcements?limit=50'),
    enabled: isTeacher,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      const selectedOption = classOptions.find((opt: any) => opt.value === data.classId)
      const selectedClass = selectedOption?.raw
      return fetchApi('/api/teacher-portal/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          content: data.content,
          classId: selectedClass?.classSectionId ?? selectedClass?.legacyClassId ?? selectedClass?.id ?? data.classId,
          classSectionId: selectedClass?.classSectionId ?? null,
          legacyClassId: selectedClass?.legacyClassId ?? null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
        }),
      })
    },
    onSuccess: () => {
      notify.success('Announcement published successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-announcements'] })
      setFormData({ title: '', content: '', classId: '', expiresAt: '' })
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to publish announcement'),
  })

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetchApi(`/api/teacher-portal/announcements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      notify.success('Announcement updated successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-announcements'] })
      setEditAnn(null)
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to update announcement'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/teacher-portal/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Announcement deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-announcements'] })
      setDeleteAnn(null)
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to delete announcement'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.classId) return notify.error('Please select a class')
    createMutation.mutate(formData)
  }

  if (!isTeacher) return <div className="p-8 text-center text-gray-500">Access Restricted</div>

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Class Announcements</h1>
          <p className="text-sm text-gray-500">Broadcast messages and share links with your students</p>
        </div>
      </div>

      {/* Create form */}
      <Card className="border-indigo-100 shadow-sm">
        <CardHeader className="bg-indigo-50/50 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-600" />
            Create Announcement
          </CardTitle>
          <CardDescription>
            Students in the selected class will see this message on their portal dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Class *</Label>
                <Select
                  value={formData.classId}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, classId: val }))}
                  disabled={classesLoading || classes.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={classesLoading ? 'Loading classes…' : 'Select Class'} />
                  </SelectTrigger>
                  <SelectContent>
                    {classOptions.map((option: any) => (
                      <SelectItem key={`${option.value}-${option.label}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!classesLoading && classes.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No class assignments found. Contact admin.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Expiration Date (Optional)</Label>
                <Input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={formData.expiresAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                required
                placeholder="e.g. Change in tomorrow's class schedule"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Message / Links *</Label>
              <Textarea
                required rows={4}
                placeholder="Type your message here. You can paste URLs which will be clickable for students."
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Publishing...' : 'Publish Announcement'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center p-8 text-gray-500">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed">
            <Megaphone className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-gray-900">No announcements</h3>
            <p className="text-sm text-gray-500 mt-1">You haven&apos;t posted any announcements yet.</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <Card key={ann.id} className="overflow-hidden">
              <div className="p-4 sm:p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base sm:text-lg text-gray-900 truncate">{ann.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 flex-shrink-0" />
                        {ann.class?.name ?? 'Class'} ({ann.class?.section ?? ''})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        {new Date(ann.publishedAt).toLocaleDateString('en-PK', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditAnn(ann)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleteAnn(ann)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100">
                  {ann.content}
                </div>
                {ann.expiresAt && (
                  <div className="text-xs text-amber-600 bg-amber-50 inline-flex px-2 py-1 rounded-md border border-amber-100 self-start">
                    Expires: {new Date(ann.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      {editAnn && (
        <EditAnnouncementDialog
          announcement={editAnn}
          open={!!editAnn}
          onClose={() => setEditAnn(null)}
          onSave={(data) => editMutation.mutate({ id: editAnn.id, data })}
          isPending={editMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAnn} onOpenChange={(o) => !o && setDeleteAnn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteAnn?.title}&quot;? Students will no longer see this announcement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction>
            <Button
              variant="destructive"
              onClick={() => deleteAnn && deleteMutation.mutate(deleteAnn.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Edit Announcement Dialog ─────────────────────────────────────────────────

function EditAnnouncementDialog({
  announcement, open, onClose, onSave, isPending,
}: {
  announcement: Announcement
  open: boolean
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState({
    title:     announcement.title,
    content:   announcement.content,
    expiresAt: announcement.expiresAt
      ? new Date(announcement.expiresAt).toISOString().split('T')[0]
      : '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      title:     form.title,
      content:   form.content,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-indigo-600" />
            Edit Announcement
          </DialogTitle>
          <DialogDescription>
            Update announcement content. Target class cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="rounded-lg bg-gray-50 border p-3 text-sm text-gray-600">
            <span className="font-medium text-gray-800">
              {announcement.class?.name ?? 'Class'} ({announcement.class?.section ?? ''})
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Message / Links *</Label>
            <Textarea
              required rows={4}
              value={form.content}
              onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Expiration Date (optional)</Label>
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm(p => ({ ...p, expiresAt: e.target.value }))}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
