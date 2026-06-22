'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/lib/notify'
import { 
  ShieldAlert, 
  MessageSquare, 
  CheckCircle, 
  Trash2, 
  Clock, 
  Info, 
  Plus, 
  Inbox, 
  Loader2,
  Lock
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'

interface Complaint {
  id: string
  complainantId: string
  complainantName: string
  complainantRole: string
  title: string
  description: string
  status: 'PENDING' | 'RESOLVED'
  remarks: string | null
  createdAt: string
}

export default function ComplaintsPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role ?? ''

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Resolve State
  const [resolveId, setResolveId] = useState<string | null>(null)
  const [remarks, setRemarks] = useState('')
  const [isResolving, setIsResolving] = useState(false)

  // Query Complaints
  const { data: complaintsData, isLoading } = useQuery({
    queryKey: ['complaints'],
    queryFn: () => fetchPaginatedApi<Complaint>('/api/complaints?limit=100'),
    enabled: !!session,
  })

  const complaints = complaintsData?.data ?? []

  // Mutate Submit Complaint
  const submitMutation = useMutation({
    mutationFn: (data: any) => fetchApi('/api/complaints', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      notify.success('Complaint Filed Successfully', {
        description: 'Our administration has been notified and will review your file shortly.',
      })
      setTitle('')
      setDescription('')
    },
    onError: (err: any) => {
      notify.error('Submission failed', { description: err.message })
    }
  })

  // Mutate Resolve Complaint
  const resolveMutation = useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string }) => 
      fetchApi(`/api/complaints/${id}`, { method: 'PUT', body: JSON.stringify({ remarks }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      notify.success('Complaint Marked as Resolved', {
        description: 'Case has been closed and the complainant has been updated.',
      })
      setResolveId(null)
      setRemarks('')
    },
    onError: (err: any) => {
      notify.error('Action failed', { description: err.message })
    }
  })

  // Mutate Delete Complaint
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/complaints/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      notify.success('Complaint Record Removed', {
        description: 'The complaint entry has been deleted from academic registers.',
      })
    },
    onError: (err: any) => {
      notify.error('Deletion failed', { description: err.message })
    }
  })



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !description) {
      notify.error('Fields Missing', { description: 'Please provide both title and description.' })
      return
    }

    setIsSubmitting(true)
    try {
      await submitMutation.mutateAsync({ title, description })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolveId || !remarks) {
      notify.error('Remarks Needed', { description: 'Provide resolution details.' })
      return
    }

    setIsResolving(true)
    try {
      await resolveMutation.mutateAsync({ id: resolveId, remarks })
    } finally {
      setIsResolving(false)
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to permanently delete this complaint record?')) {
      deleteMutation.mutate(id)
    }
  }

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <motion.div variants={fadeUp(0.1)} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-700 via-rose-700 to-rose-800 p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent)]" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-400/30 text-red-200 text-xs font-semibold mb-4">
            <ShieldAlert className="w-3.5 h-3.5" />
            Grievance Resolution Registry
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Complaints Portal
          </h1>
          <p className="mt-2 text-red-100 max-w-2xl text-sm leading-relaxed">
            File formal concerns and audit organizational feedback. Super-admins and admins review, resolve, and maintain security logs for all entries.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Submit Complaint / Resolution Box */}
        <motion.div variants={fadeUp(0.2)} className="lg:col-span-5 space-y-6">
          {resolveId && (
            <Card className="border-[2px] border-amber-500/40 bg-amber-50/50 shadow-md">
              <CardHeader>
                <CardTitle className="text-amber-800 text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-amber-600" />
                  Resolve Complaint
                </CardTitle>
                <CardDescription className="text-amber-700/80">
                  Document the audit action, communication response, or administrative resolution for this case.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResolveSubmit} className="space-y-4">
                  <div className="bg-white border border-amber-200/50 p-4 rounded-xl text-xs space-y-1">
                    <p className="font-semibold text-slate-800">
                      Case: {complaints.find(c => c.id === resolveId)?.title}
                    </p>
                    <p className="text-slate-500 italic">
                      "{complaints.find(c => c.id === resolveId)?.description}"
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Resolution Remarks / Outcome
                    </label>
                    <textarea
                      rows={3}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="e.g. Discussed with parent. Classroom seating rearranged to support concentration."
                      className="w-full text-sm rounded-lg border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      type="submit"
                      disabled={isResolving}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                    >
                      {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Resolution'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setResolveId(null)}
                      className="border-slate-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Form Card */}
          <Card className="border border-slate-200/80 shadow-md">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-slate-850 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-rose-600" />
                Register a Complaint
              </CardTitle>
              <CardDescription className="text-slate-500">
                Guards, parents, and administrative staff can register structured reports or formal concerns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Complaint Subject / Title
                  </label>
                  <Input
                    placeholder="Enter short summary of the concern"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-slate-300/80 bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Detailed Account / Grievance Statement
                  </label>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the incident, details, or request comprehensively..."
                    className="w-full text-sm rounded-lg border border-slate-300/80 p-3 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold py-2.5 shadow-md flex items-center justify-center gap-2 rounded-lg"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <>
                      Register Report
                      <Plus className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right Side: Ledger of Complaints */}
        <motion.div variants={fadeUp(0.3)} className="lg:col-span-7">
          <Card className="border border-slate-200/80 shadow-md">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                Audit Logs & Registry
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                History of logged grievances and official responses.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
                  <p className="text-sm">Loading registers...</p>
                </div>
              ) : complaints.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Inbox className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">No complaints registered</p>
                  <p className="text-xs">There are currently no active or filed concerns recorded.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {complaints.map((c) => {
                    const isResolved = c.status === 'RESOLVED'

                    return (
                      <div key={c.id} className="p-5 hover:bg-slate-50/50 transition-all space-y-3">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm">
                                {c.title}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                                By {c.complainantName} ({c.complainantRole})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              Logged: {new Date(c.createdAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isResolved 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {isResolved ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {c.status}
                            </span>

                            {/* Admin Controls */}
                            {isAdmin && (
                              <div className="flex gap-1.5">
                                {!isResolved && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 px-2 border-slate-300 bg-white hover:bg-slate-50 text-amber-600 hover:text-amber-700 font-bold"
                                    onClick={() => {
                                      setResolveId(c.id)
                                      window.scrollTo({ top: 0, behavior: 'smooth' })
                                    }}
                                  >
                                    Resolve
                                  </Button>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  onClick={() => handleDelete(c.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
                          <p className="text-slate-600 leading-relaxed font-medium">
                            <strong className="text-slate-700">Account:</strong> "{c.description}"
                          </p>
                          {c.remarks && (
                            <p className="mt-2 text-emerald-800 flex items-start gap-1 border-t border-slate-200/50 pt-2 font-semibold">
                              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>Resolution Note: "{c.remarks}"</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
