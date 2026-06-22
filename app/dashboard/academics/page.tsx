'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import Link from 'next/link'
import {
  Award, BookOpen, TrendingUp, CheckCircle, XCircle,
  FileText, BarChart2, Star, ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StudentProfile {
  id: string
  firstName: string
  lastName: string
  fatherName: string
  registrationNumber: string
  rollNumber: string | null
  profilePicture: string | null
  dateOfBirth: string
  bloodGroup: string | null
  shift?: string | null
  deliveryMode?: string | null
  enrollmentStatus?: string | null
  section?: string | null
  class?: { name: string; grade: string | null; shift: string }
  campus?: { name: string; code: string }
  batch?: { name: string; code: string }
  house?: { name: string; color: string }
  guardians?: Array<{ firstName: string; lastName: string; phoneNumber: string; relationship: string }>
}

interface TermSubjectResult {
  id: string
  totalMarks: number
  obtainedMarks: number
  grade: string
  resultStatus: string
  subjectOffering?: { subject?: { name: string } }
}

interface TermResult {
  id: string
  examSessionId: string
  declarationStatus: string
  overallPercentage: number
  grade: string
  classPosition: number | null
  performanceBatch: string | null
  teacherRemarks: string | null
  customFields: Array<{ label: string; value: string }> | null
  subjectResults: TermSubjectResult[]
  createdAt: string
}

// ─── Grade helpers ───────────────────────────────────────────────────────────

const GRADE_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  'A+': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Outstanding' },
  'A':  { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',   label: 'Excellent' },
  'B+': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    label: 'Very Good' },
  'B':  { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     label: 'Good' },
  'C':  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200',  label: 'Satisfactory' },
  'D':  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  label: 'Pass' },
  'F':  { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     label: 'Fail' },
}

function gradeConfig(grade: string) {
  return GRADE_CONFIG[grade] ?? { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', label: grade }
}

function getOverallGrade(pct: number): string {
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

function pctColor(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-blue-500'
  if (pct >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function pctTextColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-700'
  if (pct >= 60) return 'text-blue-700'
  if (pct >= 40) return 'text-yellow-700'
  return 'text-red-600'
}

// ─── Subject Result Row Component ────────────────────────────────────────────

function SubjectRow({ subject, obtained, total, grade, status }: {
  subject: string
  obtained: number
  total: number
  grade: string
  status: string
}) {
  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0
  const cfg = gradeConfig(grade)
  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/60 transition-colors border-b last:border-0 border-gray-100">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{subject}</p>
        <p className="text-[11px] text-gray-400 font-medium mt-0.5">{obtained} / {total} marks</p>
      </div>
      <div className="w-28 hidden sm:block">
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${pctColor(pct)}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className={`text-[11px] font-bold mt-0.5 ${pctTextColor(pct)}`}>{pct}%</p>
      </div>
      <div className={`px-2.5 py-1 rounded-lg border text-xs font-black ${cfg.bg} ${cfg.text} ${cfg.border} min-w-[48px] text-center`}>
        {grade}
      </div>
      <div className="flex items-center gap-1">
        {status === 'PASS'
          ? <CheckCircle className="w-4 h-4 text-emerald-600" />
          : <XCircle className="w-4 h-4 text-red-500" />}
        <span className={`text-[11px] font-bold hidden sm:block ${status === 'PASS' ? 'text-emerald-700' : 'text-red-600'}`}>
          {status}
        </span>
      </div>
    </div>
  )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color, iconBg }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  color: string
  iconBg: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-xl ${iconBg} flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-2xl font-black leading-none ${color}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 font-medium mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Loading State ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border p-5 flex items-start gap-4">
            <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border p-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-12 rounded-lg" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudentAcademicsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = session?.user?.role

  // Guard: only students
  useEffect(() => {
    if (status === 'loading') return
    if (role && role !== 'STUDENT') {
      router.replace('/dashboard/results')
    }
  }, [status, role, router])

  const [selectedTermId, setSelectedTermId] = useState<string>('')

  // Fetch student profile
  const { data: profileRaw, isLoading: profileLoading } = useQuery<any>({
    queryKey: ['student-profile-academics'],
    queryFn: () => fetchApi<any>('/api/students/profile'),
    enabled: role === 'STUDENT',
  })
  const profile: StudentProfile | null = profileRaw?.data ?? profileRaw ?? null

  // Fetch declared term results via the new academic-upgrades API
  const { data: termResultsRaw, isLoading: resultsLoading } = useQuery<any>({
    queryKey: ['student-term-results-academics', profile?.id],
    queryFn: () => fetchApi<any>(`/api/academic-upgrades/results?studentId=${profile!.id}`),
    enabled: role === 'STUDENT' && !!profile?.id,
  })
  const allTermResults: TermResult[] = useMemo(() => {
    const raw = termResultsRaw
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.data)) return raw.data
    return []
  }, [termResultsRaw])

  // Auto-select most recent term
  useEffect(() => {
    if (allTermResults.length > 0 && !selectedTermId) {
      setSelectedTermId(allTermResults[0].examSessionId)
    }
  }, [allTermResults, selectedTermId])

  const activeTermResult = useMemo(() =>
    allTermResults.find(r => r.examSessionId === selectedTermId) ?? allTermResults[0] ?? null
  , [allTermResults, selectedTermId])

  // Overall stats across all declared terms
  const stats = useMemo(() => {
    if (allTermResults.length === 0) return { avg: 0, highest: 0, grade: 'N/A', termsCount: 0 }
    const avg = allTermResults.reduce((s, r) => s + Number(r.overallPercentage), 0) / allTermResults.length
    const highest = Math.max(...allTermResults.map(r => Number(r.overallPercentage)))
    return {
      avg: Math.round(avg),
      highest: Math.round(highest),
      grade: activeTermResult?.grade ?? getOverallGrade(avg),
      termsCount: allTermResults.length,
    }
  }, [allTermResults, activeTermResult])

  const isLoading = profileLoading || resultsLoading

  if (status === 'loading' || (role && role !== 'STUDENT')) return null

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="min-h-screen bg-slate-50/30 pb-16">
      {/* ─── Header Banner ──────────────────────────────────────────── */}
      <motion.div variants={fadeUp(0.1)} className="bg-gradient-to-br from-indigo-700 via-blue-700 to-blue-800 text-white px-4 sm:px-6 lg:px-8 pt-8 pb-16 relative overflow-hidden">
        {/* decorative circles */}
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="absolute bottom-0 left-1/2 w-96 h-32 rounded-full bg-white/5 -translate-x-1/2 translate-y-1/2" />

        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-6 relative z-10">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur border-2 border-white/30 flex items-center justify-center font-black text-2xl flex-shrink-0 shadow-xl overflow-hidden">
            {profile?.profilePicture ? (
              <img src={profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              profile ? `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}` : '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Student Portal — Academics</p>
            {profileLoading
              ? <Skeleton className="h-7 w-48 bg-white/20 mb-1" />
              : <h1 className="text-2xl sm:text-3xl font-black leading-tight truncate">
                  {profile ? `${profile.firstName} ${profile.lastName}` : 'My Academics'}
                </h1>}
            <div className="flex flex-wrap gap-2 mt-2">
              {profile?.class?.name && (
                <span className="bg-white/15 border border-white/25 rounded-lg px-3 py-1 text-xs font-bold backdrop-blur">📚 {profile.class.name}</span>
              )}
              {profile?.house?.name && (
                <span className="rounded-lg px-3 py-1 text-xs font-black backdrop-blur border border-white/30" style={{ background: profile.house.color ? `${profile.house.color}55` : 'rgba(255,255,255,0.15)', color: 'white' }}>🏠 {profile.house.name}</span>
              )}
              {(profile?.class?.shift || profile?.shift) && (
                <span className="bg-white/15 border border-white/25 rounded-lg px-3 py-1 text-xs font-bold backdrop-blur">🕐 {(profile.class?.shift || profile.shift || '').replace('_', ' ')} Shift</span>
              )}
              {profile?.registrationNumber && (
                <span className="bg-white/15 border border-white/25 rounded-lg px-3 py-1 text-xs font-mono font-bold backdrop-blur">🆔 {profile.registrationNumber}</span>
              )}
              {profile?.enrollmentStatus && (
                <span className="bg-emerald-400/20 border border-emerald-300/30 rounded-lg px-3 py-1 text-xs font-bold backdrop-blur">✅ {profile.enrollmentStatus}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0"></div>
          </div>
        </motion.div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-6">
        {/* ─── Performance Score Cards ─────────────────────────────── */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* ─── Summary Stats ─────────────────────────────────── */}
            <motion.div variants={fadeUp(0.2)} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatCard icon={BarChart2} label="Average Score" value={allTermResults.length > 0 ? `${stats.avg}%` : 'N/A'} sub={allTermResults.length > 0 ? 'Across all terms' : 'No results yet'} color="text-blue-700" iconBg="bg-blue-50" />
              <StatCard icon={Award} label="Overall Grade" value={allTermResults.length > 0 ? stats.grade : '—'} sub={allTermResults.length > 0 ? gradeConfig(stats.grade).label : 'Pending'} color={gradeConfig(stats.grade).text} iconBg={gradeConfig(stats.grade).bg} />
              <StatCard icon={TrendingUp} label="Highest Term" value={allTermResults.length > 0 ? `${stats.highest}%` : '—'} sub="Best term score" color="text-emerald-700" iconBg="bg-emerald-50" />
              <StatCard icon={Star} label="Class Position" value={activeTermResult?.classPosition ? `#${activeTermResult.classPosition}` : '—'} sub={activeTermResult ? `in ${activeTermResult.examSessionId}` : 'Awaiting results'} color="text-indigo-700" iconBg="bg-indigo-50" />
            </motion.div>

            {/* ─── Term Selector ────────────────────────────────── */}
            {allTermResults.length > 1 && (
              <motion.div variants={fadeUp(0.25)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-3">Select Exam Term</p>
                <div className="flex flex-wrap gap-2">
                  {allTermResults.map(r => (
                    <button key={r.examSessionId} onClick={() => setSelectedTermId(r.examSessionId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedTermId === r.examSessionId
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-700'}`}>
                      {r.examSessionId.replace(/-/g, ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ─── Active Term Result Card ───────────────────────── */}
            {allTermResults.length === 0 ? (
              <motion.div variants={fadeUp(0.3)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BarChart2 className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-800 font-black text-lg">No Results Published Yet</p>
                <p className="text-gray-400 text-sm mt-2 max-w-sm mx-auto">Your results will appear here once your teacher declares them.</p>
              </motion.div>
            ) : activeTermResult ? (
              <motion.div variants={fadeUp(0.3)} className="space-y-4">
                {/* Metadata strip */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 rounded-xl"><BookOpen className="w-4 h-4 text-indigo-600" /></div>
                      <div>
                        <p className="font-black text-gray-900 text-sm">{activeTermResult.examSessionId.replace(/-/g,' ').toUpperCase()}</p>
                        <p className="text-[11px] text-gray-400 font-medium">{activeTermResult.subjectResults?.length ?? 0} subjects · {activeTermResult.declarationStatus}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-gray-400 font-bold">Overall</p>
                        <p className={`text-xl font-black ${pctTextColor(Number(activeTermResult.overallPercentage))}`}>{Number(activeTermResult.overallPercentage).toFixed(1)}%</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-xl border text-sm font-black ${gradeConfig(activeTermResult.grade).bg} ${gradeConfig(activeTermResult.grade).text} ${gradeConfig(activeTermResult.grade).border}`}>
                        {activeTermResult.grade}
                      </div>
                    </div>
                  </div>
                  {/* Position & Batch */}
                  {(activeTermResult.classPosition || activeTermResult.performanceBatch) && (
                    <div className="px-5 py-3 flex flex-wrap gap-4 border-b border-gray-50 bg-indigo-50/30">
                      {activeTermResult.classPosition && (
                        <div className="flex items-center gap-2">
                          <Star className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-xs font-bold text-gray-700">Class Position: <span className="font-black text-indigo-700">#{activeTermResult.classPosition}</span></span>
                        </div>
                      )}
                      {activeTermResult.performanceBatch && (
                        <div className="flex items-center gap-2">
                          <Award className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs font-bold text-gray-700">Batch: <span className="font-black text-blue-700 font-mono">{activeTermResult.performanceBatch}</span></span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Subject rows */}
                  <div className="divide-y divide-gray-50">
                    {(activeTermResult.subjectResults ?? []).map((sr, idx) => (
                      <SubjectRow key={sr.id}
                        subject={sr.subjectOffering?.subject?.name || `Subject ${idx + 1}`}
                        obtained={sr.obtainedMarks} total={sr.totalMarks}
                        grade={sr.grade} status={sr.resultStatus} />
                    ))}
                  </div>
                  {/* Remarks */}
                  {activeTermResult.teacherRemarks && (
                    <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100">
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">Teacher&apos;s Remarks</p>
                      <p className="text-sm text-gray-700 italic">&ldquo;{activeTermResult.teacherRemarks}&rdquo;</p>
                    </div>
                  )}
                  {/* Custom fields */}
                  {Array.isArray(activeTermResult.customFields) && activeTermResult.customFields.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100">
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Additional Assessments</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(activeTermResult.customFields as any[]).map((cf, i) => (
                          <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-1.5">
                            <span className="text-[11px] text-gray-500 font-bold uppercase">{cf.label}</span>
                            <span className="text-xs font-black text-gray-900">{cf.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}

            {/* ─── Quick Action Cards ──────────────────────────────── */}
            <motion.div variants={fadeUp(0.4)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link href="/dashboard/documents?doc=student_profile" className="block h-full">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer group h-full flex flex-col">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5 text-indigo-700" />
                  </div>
                  <p className="font-black text-gray-900 text-sm mb-1">Student Profile (PDF)</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed flex-1">Download your official student profile with verified details, photo, and academy seal.</p>
                  <div className="flex items-center gap-1 mt-3 text-xs font-bold text-indigo-700">
                    Download PDF <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </Link>
              <div className="block h-full">
                <div className="bg-emerald-50/60 rounded-2xl border border-emerald-100 shadow-sm p-5 h-full flex flex-col">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
                    <Award className="w-5 h-5 text-emerald-700" />
                  </div>
                  <p className="font-black text-gray-900 text-sm mb-1">Result Card</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed flex-1">Your official result card is generated and issued by the Academy administration. View your scores above.</p>
                  <div className="flex items-center gap-1 mt-3 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg w-fit">
                    Issued by Admin Only
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ─── Grade Scale Reference ───────────────────────────── */}
            <motion.div variants={fadeUp(0.45)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-3">Grade Scale Reference</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(GRADE_CONFIG).map(([grade, cfg]) => (
                  <div key={grade} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                    <span className="font-black">{grade}</span>
                    <span className="font-medium opacity-80">— {cfg.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  )
}
