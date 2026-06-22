'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ActivityLogCard } from '@/components/shared/ActivityLogCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { 
  BookOpen, 
  HelpCircle, 
  CheckCircle, 
  MessageSquare, 
  Clock, 
  Send, 
  User, 
  ArrowRight,
  Inbox, 
  Loader2,
  Lock
} from 'lucide-react'

interface StudentQuery {
  id: string
  studentId: string
  studentName: string
  teacherId: string
  teacherName: string
  subject: string
  queryText: string
  status: 'PENDING' | 'ANSWERED'
  response: string | null
  createdAt: string
}

interface TeacherListItem {
  userId: string
  firstName: string
  lastName: string
  specialization: string | null
}

export default function QueriesPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role ?? ''

  // Form State
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [subject, setSubject] = useState('')
  const [queryText, setQueryText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Response State
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const [teacherResponse, setTeacherResponse] = useState('')
  const [isResponding, setIsResponding] = useState(false)

  // Load Queries
  const { data: queriesData, isLoading } = useQuery({
    queryKey: ['student-queries'],
    queryFn: () => fetchPaginatedApi<StudentQuery>('/api/queries?limit=100'),
    enabled: !!session,
  })

  const queries = queriesData?.data ?? []

  // Load Teachers (Student only)
  const { data: teachersData } = useQuery({
    queryKey: ['teachers-list'],
    queryFn: () => fetchApi<TeacherListItem[]>('/api/queries?getTeachers=true'),
    enabled: !!session && userRole === 'STUDENT',
  })

  const teachers = Array.isArray(teachersData)
    ? teachersData
    : (teachersData as { data?: TeacherListItem[] } | undefined)?.data ?? []

  // Submit Query Mutation
  const submitMutation = useMutation({
    mutationFn: (data: any) => fetchApi('/api/queries', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-queries'] })
      notify.success('Query Submitted Successfully', {
        description: 'Your teacher has been notified and will answer soon.',
      })
      setSubject('')
      setQueryText('')
      setSelectedTeacherId('')
    },
    onError: (err: any) => {
      notify.error('Submission failed', { description: err.message })
    }
  })

  // Respond Mutation
  const respondMutation = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) => 
      fetchApi(`/api/queries/${id}`, { method: 'PUT', body: JSON.stringify({ response }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-queries'] })
      notify.success('Response Submitted', {
        description: 'Your academic response has been dispatched to the student.',
      })
      setActiveQueryId(null)
      setTeacherResponse('')
    },
    onError: (err: any) => {
      notify.error('Response failed', { description: err.message })
    }
  })

  // Handle Query Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTeacherId || !subject || !queryText) {
      notify.error('Required Fields Missing', { description: 'Select a teacher, specify subject, and explain your query.' })
      return
    }

    setIsSubmitting(true)
    try {
      await submitMutation.mutateAsync({
        teacherId: selectedTeacherId,
        subject,
        queryText,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Teacher Response
  const handleRespondSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeQueryId || !teacherResponse) {
      notify.error('Input Empty', { description: 'Provide a valid answer text before sending.' })
      return
    }

    setIsResponding(true)
    try {
      await respondMutation.mutateAsync({
        id: activeQueryId,
        response: teacherResponse,
      })
    } finally {
      setIsResponding(false)
    }
  }

  // Block other roles (Accountants etc.) from access
  if (userRole !== 'STUDENT' && userRole !== 'TEACHER' && userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center p-6 space-y-4">
        <div className="p-4 bg-rose-50 rounded-full border border-rose-200 text-rose-600 animate-pulse">
          <Lock className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Support Desk Restricted</h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          The Academic Support desk is reserved exclusively for students seeking help, and teaching staff who handle the responses.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-teal-800 p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent)]" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-semibold mb-4">
            <BookOpen className="w-3.5 h-3.5" />
            1-on-1 Academic Support Desk
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Student Help & Queries
          </h1>
          <p className="mt-2 text-emerald-100 max-w-2xl text-sm leading-relaxed">
            Need support on coursework or homework? Ask academic questions. Only teachers assigned to the subject will receive and answer your queries.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Forms */}
        <div className="lg:col-span-5 space-y-6">
          {/* Teacher Response Panel */}
          {userRole === 'TEACHER' && activeQueryId && (
            <Card className="border-[2px] border-emerald-500/40 bg-emerald-50/50 shadow-md">
              <CardHeader>
                <CardTitle className="text-emerald-800 text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Answer Student Query
                </CardTitle>
                <CardDescription className="text-emerald-700/80">
                  Write detailed feedback or academic help to resolve the student's doubt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRespondSubmit} className="space-y-4">
                  <div className="bg-white border border-emerald-200/50 p-4 rounded-xl text-xs space-y-2">
                    <p className="font-semibold text-slate-800">
                      Student: {queries.find(q => q.id === activeQueryId)?.studentName}
                    </p>
                    <p className="text-slate-500">
                      <strong>Subject:</strong> {queries.find(q => q.id === activeQueryId)?.subject}
                    </p>
                    <p className="text-slate-650 italic">
                      "{queries.find(q => q.id === activeQueryId)?.queryText}"
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Your Response / Help Text
                    </label>
                    <textarea
                      rows={4}
                      value={teacherResponse}
                      onChange={(e) => setTeacherResponse(e.target.value)}
                      placeholder="Type your explanation, hints or answers here..."
                      className="w-full text-sm rounded-lg border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      type="submit"
                      disabled={isResponding}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      {isResponding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Explanation'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveQueryId(null)}
                      className="border-slate-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Student Query Submission Form */}
          {userRole === 'STUDENT' && (
            <Card className="border border-slate-200/80 shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-slate-850 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-emerald-600" />
                  Ask a Teacher
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Select a certified teacher, specify subject matter, and write down your query.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Select Teacher
                    </label>
                    <Select 
                      value={selectedTeacherId} 
                      onValueChange={(val: string) => setSelectedTeacherId(val)}
                    >
                      <SelectTrigger className="border-slate-300/80 bg-white">
                        <SelectValue placeholder="Choose target teacher..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map((t) => (
                          <SelectItem key={t.userId} value={t.userId}>
                            {t.firstName} {t.lastName} {t.specialization ? `(${t.specialization})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Subject
                    </label>
                    <Input
                      placeholder="e.g. Physics Homework Chapter 4"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="border-slate-300/80 bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Your Question / Inquiry
                    </label>
                    <textarea
                      rows={5}
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      placeholder="Write your explanation or attach equations/questions here..."
                      className="w-full text-sm rounded-lg border border-slate-300/80 p-3 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 shadow-md flex items-center justify-center gap-2 rounded-lg"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <>
                        Dispatch Query
                        <Send className="w-4.5 h-4.5" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {userRole !== 'STUDENT' && !activeQueryId && (
            <Card className="border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
              <div className="flex flex-col items-center text-center space-y-2">
                <HelpCircle className="w-10 h-10 text-slate-400" />
                <h3 className="font-bold text-slate-800 text-base">Select a Query</h3>
                <p className="text-xs text-slate-500">
                  Choose a student question from the registry on the right to start drafting responses and resolving queries.
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Query Registry */}
        <div className="lg:col-span-7">
          <Card className="border border-slate-200/80 shadow-md">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                Academic Support Ledger
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                History of academic questions and status logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <p className="text-sm">Loading queries...</p>
                </div>
              ) : queries.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Inbox className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">No questions recorded</p>
                  <p className="text-xs">There are no academic questions filed in this section.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {queries.map((q) => {
                    const isAnswered = q.status === 'ANSWERED'

                    return (
                      <div key={q.id} className="p-5 hover:bg-slate-50/50 transition-all space-y-3">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm">
                                {q.subject}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                                Student: {q.studentName}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">
                                Teacher: {q.teacherName}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              Date: {new Date(q.createdAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isAnswered 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {isAnswered ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {q.status}
                            </span>

                            {userRole === 'TEACHER' && !isAnswered && (
                              <Button 
                                size="sm" 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 py-0 text-xs shadow-sm"
                                onClick={() => {
                                  setActiveQueryId(q.id)
                                  window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}
                              >
                                Answer
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
                          <p className="text-slate-600 leading-relaxed font-medium">
                            <strong className="text-slate-700">Question:</strong> "{q.queryText}"
                          </p>
                          {q.response && (
                            <p className="mt-2.5 text-emerald-800 flex items-start gap-1.5 border-t border-slate-200/50 pt-2.5 font-semibold">
                              <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>Answer: "{q.response}"</span>
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

          <div className="mt-6">
            <ActivityLogCard
              apiUrl="/api/queries/activity"
              title="Query Activity Feed"
              description="Audit trail for academic query submissions, answers, and deletions relevant to your role."
              emptyText="No query activity exists yet in this section."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
