'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import { useSession } from 'next-auth/react'
import {
  Megaphone, Plus, Pencil, Trash2, RefreshCw, Mail, Calendar, Clock,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string
  title: string
  content: string
  targetRole?: string | null
  isActive: boolean
  publishedAt: string
  expiresAt?: string | null
  createdBy: string
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  STUDENT: { label: 'Students',  cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  TEACHER: { label: 'Teachers',  cls: 'bg-green-100 text-green-700 border-green-200' },
  PARENT:  { label: 'Parents',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  ADMIN:   { label: 'Admins',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}
const getRoleBadge = (r?: string | null) =>
  r ? ROLE_BADGE[r] ?? { label: r, cls: 'bg-gray-100 text-gray-600' }
    : { label: 'All Users', cls: 'bg-gray-100 text-gray-600 border-gray-200' }

const EMPTY_FORM = { title: '', content: '', targetRole: 'ALL', expiresAt: '' }

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred'
}

// ─── Announcement Form (shared Create / Edit) ──────────────────────────────────

function AnnouncementForm({
  form,
  onChange,
}: {
  form: typeof EMPTY_FORM
  onChange: (patch: Partial<typeof EMPTY_FORM>) => void
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Title <span className="text-red-500">*</span></Label>
        <Input
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Announcement title…"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Content <span className="text-red-500">*</span></Label>
        <Textarea
          value={form.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Write the announcement content here…"
          rows={5}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Target Audience</Label>
          <Select value={form.targetRole} onValueChange={(v) => onChange({ targetRole: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Users</SelectItem>
              <SelectItem value="STUDENT">Students Only</SelectItem>
              <SelectItem value="TEACHER">Teachers Only</SelectItem>
              <SelectItem value="PARENT">Parents Only</SelectItem>
              <SelectItem value="ADMIN">Admins Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Expires At (optional)</Label>
          <Input
            type="date"
            value={form.expiresAt}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => onChange({ expiresAt: e.target.value })}
          />
        </div>
      </div>
      {/* Email notification hint */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3">
        <Mail className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          An email notification will be sent to all{' '}
          <strong>{form.targetRole === 'ALL' ? 'registered users' : getRoleBadge(form.targetRole).label}</strong>{' '}
          when this announcement is published.
        </p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const role = session?.user?.role as string | undefined
  const canCreate = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const [createOpen, setCreateOpen] = useState(false)
  const [editAnn, setEditAnn] = useState<Announcement | null>(null)
  const [deleteAnn, setDeleteAnn] = useState<Announcement | null>(null)
  const [viewAnn, setViewAnn] = useState<Announcement | null>(null)

  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM })
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM })

  // Fetch announcements for all users using the shared endpoint that applies role filters.
  const fetchUrl = '/api/announcements?limit=30'
  const { data, isLoading } = useQuery({
    queryKey: ['announcements', fetchUrl],
    queryFn: () => fetchPaginatedApi<Announcement>(fetchUrl),
  })
  const announcements = data?.data ?? []


  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (f: typeof EMPTY_FORM) =>
      fetchApi('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: f.title,
          content: f.content,
          targetRole: f.targetRole === 'ALL' ? null : f.targetRole,
          expiresAt: f.expiresAt || null,
        }),
      }),
    onSuccess: () => {
      notify.success('Announcement published! Email notifications sent.', {
        icon: <Mail className="w-4 h-4" />,
      })
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      setCreateOpen(false)
      setCreateForm({ ...EMPTY_FORM })
    },
    onError: (err) => notify.error('Failed to publish', { description: getErrorMessage(err) }),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, f }: { id: string; f: typeof EMPTY_FORM }) =>
      fetchApi(`/api/announcements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: f.title,
          content: f.content,
          targetRole: f.targetRole === 'ALL' ? null : f.targetRole,
          expiresAt: f.expiresAt || null,
        }),
      }),
    onSuccess: () => {
      notify.success('Announcement updated')
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      setEditAnn(null)
    },
    onError: (err) => notify.error('Failed to update', { description: getErrorMessage(err) }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Announcement removed')
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      setDeleteAnn(null)
    },
    onError: (err) => notify.error('Failed to delete', { description: getErrorMessage(err) }),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const validate = (f: typeof EMPTY_FORM) => {
    if (!f.title.trim()) { notify.error('Title is required'); return false }
    if (!f.content.trim()) { notify.error('Content is required'); return false }
    if (f.title.length < 2) { notify.error('Title must be at least 2 characters'); return false }
    return true
  }

  const openEdit = (a: Announcement) => {
    setEditForm({
      title: a.title,
      content: a.content,
      targetRole: a.targetRole ?? 'ALL',
      expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString().split('T')[0] : '',
    })
    setEditAnn(a)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Megaphone className="w-6 h-6" />
            </div>
            Announcements
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">School-wide notices and communications.</p>
        </div>
        {canCreate && (
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Announcement
          </Button>
        )}
      </motion.div>

      {/* List */}
      <motion.div variants={fadeUp(0.2)} className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : announcements.length === 0 ? (
          <EmptyState 
            icon={Megaphone}
            title="No announcements yet"
            description={canCreate ? undefined : "There are currently no announcements to display."}
            action={canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                Create your first announcement
              </Button>
            ) : undefined}
          />
        ) : (
          announcements.map((a) => {
            const badge = getRoleBadge(a.targetRole)
            const isExpired = a.expiresAt && new Date(a.expiresAt) < new Date()
            return (
              <Card
                key={a.id}
                className={`transition-shadow hover:shadow-md group ${!a.isActive || isExpired ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    {/* Megaphone icon */}
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Megaphone className="w-5 h-5 text-indigo-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-gray-900">{a.title}</h3>
                        <Badge variant="outline" className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
                        {(isExpired || !a.isActive) && (
                          <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500">Expired</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-3">{a.content}</p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(a.publishedAt).toLocaleDateString('en-PK', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })}
                        </span>
                        {a.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Expires {new Date(a.expiresAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-blue-400">
                          <Mail className="w-3 h-3" />
                          Email sent
                        </span>
                      </div>
                    </div>

                    {/* Action buttons — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title="View full"
                        onClick={() => setViewAnn(a)}
                      >
                        <Megaphone className="w-4 h-4" />
                      </Button>
                      {canCreate && (
                        <>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                            title="Edit"
                            onClick={() => openEdit(a)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete"
                            onClick={() => setDeleteAnn(a)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </motion.div>

      {/* ── Create Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
            <DialogDescription>
              Publish a notice to your target audience. An email notification will be sent automatically.
            </DialogDescription>
          </DialogHeader>
          <AnnouncementForm
            form={createForm}
            onChange={(patch) => setCreateForm((f) => ({ ...f, ...patch }))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => validate(createForm) && createMutation.mutate(createForm)}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Publishing…</>
                : <><Mail className="w-4 h-4 mr-2" />Publish & Notify</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={!!editAnn} onOpenChange={(o) => !o && setEditAnn(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
            <DialogDescription>Update the content of this announcement.</DialogDescription>
          </DialogHeader>
          <AnnouncementForm
            form={editForm}
            onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAnn(null)}>Cancel</Button>
            <Button
              onClick={() => editAnn && validate(editForm) && editMutation.mutate({ id: editAnn.id, f: editForm })}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Saving…</>
                : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={!!viewAnn} onOpenChange={(o) => !o && setViewAnn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewAnn?.title}</DialogTitle>
          </DialogHeader>
          {viewAnn && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`text-xs ${getRoleBadge(viewAnn.targetRole).cls}`}>
                  {getRoleBadge(viewAnn.targetRole).label}
                </Badge>
                {viewAnn.expiresAt && new Date(viewAnn.expiresAt) < new Date() && (
                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500">Expired</Badge>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{viewAnn.content}</p>
              <div className="pt-3 border-t space-y-1.5 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Published: {new Date(viewAnn.publishedAt).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                {viewAnn.expiresAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Expires: {new Date(viewAnn.expiresAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
                <div className="flex items-center gap-2 text-blue-400">
                  <Mail className="w-3.5 h-3.5" />
                  Email notification was sent to target audience
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAnn(null)}>Close</Button>
            {canCreate && (
              <Button onClick={() => { openEdit(viewAnn!); setViewAnn(null) }}>
                <Pencil className="w-4 h-4 mr-2" /> Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!deleteAnn} onOpenChange={(o) => !o && setDeleteAnn(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Announcement</DialogTitle>
            <DialogDescription>
              Remove <strong>&quot;{deleteAnn?.title}&quot;</strong>? This will hide it from all users immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAnn(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteAnn && deleteMutation.mutate(deleteAnn.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Deleting…</>
                : 'Delete Announcement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
