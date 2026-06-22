'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { GraduationCap, CreditCard, FileText, Pencil, MapPin, ShieldCheck, Sparkles, Phone } from 'lucide-react'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import type { StudentEnrollmentRow } from './StudentEnrollmentsPanel'

interface StudentDetail {
  id: string
  firstName: string
  lastName: string
  fatherName: string
  registrationNumber: string
  rollNumber?: string
  enrollmentStatus: string
  feeStatus: string
  dueAmount: number
  profilePicture?: string
  phoneNumber: string
  campus: { name: string; code: string }
  batch: { name: string }
  class?: { name: string }
  house?: { name: string; color: string }
  enrollments?: StudentEnrollmentRow[]
}

const ENROLLMENT_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  GRADUATED: 'bg-gray-100 text-gray-700',
  WITHDRAWN: 'bg-gray-100 text-gray-500',
  ON_LEAVE: 'bg-orange-100 text-orange-800',
}

const FEE_BADGE: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
}

function InfoCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${accent} p-3 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

export function StudentQuickViewDialog({
  studentId,
  onClose,
  canEdit = false,
}: {
  studentId: string | null
  onClose: () => void
  canEdit?: boolean
}) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => fetchApi<StudentDetail>(`/api/students/${studentId}`),
    enabled: !!studentId,
  })

  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN'
  const isStudentUser = session?.user?.role === 'STUDENT'

  const student = (raw as { data?: StudentDetail })?.data ?? raw

  const activeEnrollments = (student?.enrollments ?? []).filter((e) => e.status === 'ACTIVE')

  return (
    <Dialog open={!!studentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 p-0 shadow-2xl">
        <div className="rounded-t-3xl bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 p-5 text-white">
          <DialogHeader className="space-y-1 text-white">
            <DialogTitle className="text-xl font-semibold">Student Profile</DialogTitle>
            <DialogDescription className="text-indigo-100">Quick overview — polished for fast admin review and clear next actions.</DialogDescription>
          </DialogHeader>
        </div>

        {isLoading || !student ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {student.profilePicture ? (
                  <img src={student.profilePicture} alt="" className="h-20 w-20 rounded-3xl border border-slate-200 object-cover shadow-sm" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-100 to-sky-100 text-xl font-black text-indigo-700 shadow-sm">
                    {student.firstName[0]}{student.lastName[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-semibold text-slate-900">{student.firstName} {student.lastName}</p>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Profile</span>
                  </div>
                  <p className="text-sm text-slate-500">{student.fatherName}</p>
                  <p className="font-mono text-xs text-slate-400">{student.registrationNumber}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ENROLLMENT_BADGE[student.enrollmentStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                      {student.enrollmentStatus.replace('_', ' ')}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${FEE_BADGE[student.feeStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                      {student.feeStatus.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard icon={<MapPin className="h-4 w-4" />} label="Campus & Batch" value={`${student.campus.name} · ${student.batch.name}`} accent="from-indigo-50 to-blue-50" />
              <InfoCard icon={<GraduationCap className="h-4 w-4" />} label="Class" value={student.class?.name ?? 'Not assigned yet'} accent="from-emerald-50 to-green-50" />
              <InfoCard icon={<Phone className="h-4 w-4" />} label="Contact" value={student.phoneNumber} accent="from-amber-50 to-orange-50" />
              <InfoCard icon={<ShieldCheck className="h-4 w-4" />} label="Enrollment" value={student.enrollmentStatus.replace('_', ' ')} accent="from-violet-50 to-fuchsia-50" />
            </div>

            {activeEnrollments.length > 0 && (
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-indigo-900">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-sm font-semibold">Active sections</p>
                </div>
                <div className="space-y-2">
                  {activeEnrollments.map((e) => {
                    const shift = e.classSection.shift.code as SessionShift
                    return (
                      <div key={e.id} className="flex flex-col gap-1 rounded-2xl border border-white/70 bg-white/90 p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium">{e.classSection.className}-{e.classSection.sectionName}</span>
                        <span className="text-xs text-slate-500">Roll {e.rollNumber}</span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${SESSION_SHIFT_BADGE_CLASS[shift]}`}>
                          {SESSION_SHIFT_LABELS[shift]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {Number(student.dueAmount) > 0 && (
              <div className="rounded-2xl border border-red-100 bg-red-50/80 p-3 text-sm text-red-700">
                <p className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" /> Outstanding balance: Rs {Number(student.dueAmount).toLocaleString()}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link href={`/dashboard/students/${student.id}`}>
                <Button size="sm" variant="default" className="gap-1.5">Full profile</Button>
              </Link>
              {canEdit && (
                <Link href={`/dashboard/students/${student.id}/edit`}>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </Link>
              )}
              {(isAdmin || isStudentUser) && (
                <Link href={`/dashboard/documents?studentId=${student.id}&doc=id_card`}>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> ID Card
                  </Button>
                </Link>
              )}
              <Link href={`/dashboard/fees?studentId=${student.id}`}>
                <Button size="sm" variant="ghost" className="gap-1.5 text-slate-600">Fees</Button>
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
