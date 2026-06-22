'use client'

/**
 * /dashboard/teachers/[id]/edit
 *
 * Pre-populated edit form for a teacher's profile. All fields are mutable
 * except CNIC (which is a unique identity anchor) and the login email
 * (contact email is editable; auth email requires a separate flow).
 *
 * The form uses the same updateTeacherSchema-compatible payload as
 * PATCH /api/teachers/[id]. Fields that haven't changed are sent as-is;
 * the API's partial schema handles sparse updates correctly.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { fetchApi, ApiError } from '@/lib/api-client'
import { notify } from '@/lib/notify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Save, User, Phone, Briefcase, MapPin, AlertCircle, ShieldAlert, Key, Loader2, Plus, Trash2, GraduationCap } from 'lucide-react'
import Link from 'next/link'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, formatClassWithShift, type SessionShift } from '@/lib/validation/shift'
import { CampusBatchHouseFields } from '@/components/academic/CampusBatchHouseFields'
import { isPlacementScopeReady, performanceHouseRequired } from '@/lib/academic/hierarchy'
import { STAFF_DESIGNATIONS } from '@/lib/constants/staff-designations'

// ── Zod schema (permissive client-side validation for edit/update form)
// WHY: This is an UPDATE form — existing DB records may have phone/contact numbers
// in varied formats, short designations, or brief addresses recorded before strict
// validation was added. Client-side Zod here only catches truly-empty required fields.
// The server's updateTeacherSchema handles full format validation on every PATCH.
const editSchema = z.object({
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  qualification: z.string().min(1, 'Qualification is required').trim(),
  specialization: z.string().optional(),
  designation: z.string().min(1, 'Designation is required').trim(),
  experienceYears: z.coerce.number().int().min(0),
  monthlySalary: z.coerce.number().min(0).optional(),
  joiningDate: z.string().min(1, 'Joining date is required'),
  // No regex — DB may store phone numbers in any local/international format.
  // Server validates format on PATCH.
  phoneNumber: z.string().min(1, 'Phone number is required').trim(),
  email: z.string().email('Invalid email address').trim(),
  address: z.string().min(1, 'Address is required').trim(),
  city: z.string().min(1, 'City is required').trim(),
  emergencyContact: z.string().min(1, 'Emergency contact is required').trim(),
  isActive: z.boolean(),
  profilePicture: z.string().optional(),
  campusId: z.string().min(1, 'Campus is required — please select a campus'),
  batchId: z.string().optional(),
  houseId: z.string().optional(),
})

type EditForm = z.infer<typeof editSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateInput(iso: string | Date | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function toIsoString(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('.')[0] + 'Z'
}

// ─────────────────────────────────────────────────────────────────────────────
export default function EditTeacherPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [assignShift, setAssignShift] = useState<SessionShift>('MORNING')
  const [assignClassId, setAssignClassId] = useState('')
  const [assignYear, setAssignYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`)
  const [assignAsIncharge, setAssignAsIncharge] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)

  // Fetch current teacher data
  const { data: raw, isLoading, error } = useQuery({
    queryKey: ['teacher-detail', id],
    queryFn: () => fetchApi<any>(`/api/teachers/${id}`),
    enabled: !!id,
  })

  const teacher = raw?.data ?? raw

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditForm>({
    // WHY no zodResolver: The resolver was calling onInvalid({}) (empty object)
    // in edge cases where the form store had Select-backed fields that hadn't
    // been touched. Manual validation in onSubmit is simpler and more reliable
    // for update forms where most validation happens server-side anyway.
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: 'MALE',
      designation: 'Teacher',
      isActive: true,
      experienceYears: 0,
      campusId: '',
      batchId: '',
      houseId: '',
      phoneNumber: '',
      email: '',
      address: '',
      city: '',
      emergencyContact: '',
      qualification: '',
      joiningDate: '',
      dateOfBirth: '',
    },
  })

  const selectedCampusId = watch('campusId')
  const selectedBatchId = watch('batchId')
  const genderValue = watch('gender')
  const designationValue = watch('designation')

  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchApi<any>('/api/campuses'),
  })
  const campuses = Array.isArray(campusesData) ? campusesData : []

  const { data: batchesData, isLoading: isLoadingBatches } = useQuery({
    queryKey: ['batches', selectedCampusId],
    queryFn: () => fetchApi<any>(`/api/batches?campusId=${selectedCampusId}`),
    enabled: !!selectedCampusId,
  })
  const batches = Array.isArray(batchesData) ? batchesData : []

  const { data: housesData, isLoading: isLoadingHouses } = useQuery({
    queryKey: ['houses', selectedBatchId],
    queryFn: () => fetchApi<any[]>(`/api/houses?batchId=${selectedBatchId}`),
    enabled: !!selectedBatchId,
  })
  const houses = housesData ?? []
  const selectedHouseId = watch('houseId') ?? ''
  const placementReady = isPlacementScopeReady(
    selectedCampusId,
    selectedBatchId,
    selectedHouseId,
    houses.length > 0
  )
  const houseRequired = performanceHouseRequired(houses.length > 0)

  const { data: classAssignmentsRaw, refetch: refetchAssignments } = useQuery({
    queryKey: ['teacher-class-assignments', id],
    queryFn: () => fetchApi<any[]>(`/api/teachers/${id}/classes`),
    enabled: !!id,
  })
  const classAssignments = classAssignmentsRaw ?? []

  // WHY /api/class-sections: The Academic Engine stores classes in the ClassSection
  // model (with FK to Shift), not the legacy Class model. Evening/Night classes only
  // exist in ClassSection — querying the legacy model returns an empty list.
  const { data: availableClassesRaw } = useQuery({
    queryKey: ['class-sections-for-teacher-assign', selectedCampusId, selectedBatchId, assignShift],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (selectedCampusId) p.set('campusId', selectedCampusId)
      if (selectedBatchId) p.set('batchId', selectedBatchId)
      const res = await fetchApi<any>(`/api/class-sections?${p}`)
      const sections = Array.isArray(res) ? res : res?.data ?? []
      // Filter by shift code on the client side
      return sections.filter((s: { shift?: { code?: string } }) => s.shift?.code === assignShift)
    },
    enabled: !!selectedCampusId && !!selectedBatchId,
  })
  const availableClasses = (availableClassesRaw ?? []).filter(
    (sec: { id: string }) => !classAssignments.some((a: { classSectionId?: string }) => a.classSectionId === sec.id)
  )

  const assignedShifts = Array.from(
    new Set(
      classAssignments
        .map((a: { shift?: SessionShift }) => a.shift)
        .filter(Boolean) as SessionShift[]
    )
  )

  // Populate form once teacher data is loaded.
  // WHY: Use `||` not `??` for all string fields — nullish coalescing only
  // guards null/undefined, NOT empty strings from the database. Empty strings
  // would pass through and fail the Zod min() validators silently on submit.
  useEffect(() => {
    if (!teacher) return
    const resolvedDesignation = teacher.designation || 'Teacher'
    const resolvedGender = teacher.gender || 'MALE'
    reset({
      firstName: teacher.firstName || '',
      lastName: teacher.lastName || '',
      gender: resolvedGender as 'MALE' | 'FEMALE',
      dateOfBirth: toDateInput(teacher.dateOfBirth),
      qualification: teacher.qualification || '',
      specialization: teacher.specialization || '',
      designation: resolvedDesignation,
      experienceYears: teacher.experienceYears ?? 0,
      monthlySalary: teacher.monthlySalary ?? undefined,
      joiningDate: toDateInput(teacher.joiningDate),
      phoneNumber: teacher.phoneNumber || '',
      email: teacher.email || '',
      address: teacher.address || '',
      city: teacher.city || '',
      emergencyContact: teacher.emergencyContact || '',
      isActive: teacher.isActive ?? true,
      profilePicture: teacher.profilePicture || '',
      campusId: teacher.campusId || '',
      batchId: teacher.batchId || '',
      houseId: teacher.houseId || '',
    }, { keepDefaultValues: false })
    // Explicitly sync Select components that use watch/setValue pattern.
    // Radix Selects are uncontrolled under react-hook-form; reset() updates
    // the form store but not the component's local state.
    setValue('designation', resolvedDesignation, { shouldDirty: false })
    setValue('gender', resolvedGender as 'MALE' | 'FEMALE', { shouldDirty: false })
    if (teacher.campusId) {
      setValue('campusId', teacher.campusId, { shouldDirty: false })
    }
    if (teacher.profilePicture) setPreviewImage(teacher.profilePicture)
    if (teacher.email) setResetEmail(teacher.email)
  }, [teacher, reset, setValue])

  const handleCredentialsReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      notify.error('Email is required')
      return
    }
    if (!confirm('Are you sure you want to update login credentials for this teacher?')) return

    setIsResetting(true)
    try {
      await fetchApi('/api/users/reset-credentials', {
        method: 'POST',
        body: JSON.stringify({
          userId: teacher.userId,
          newEmail: resetEmail !== teacher.email ? resetEmail : undefined,
          newPassword: resetPassword || undefined,
        })
      })
      notify.success('Credentials updated successfully!')
      setResetPassword('')
      queryClient.invalidateQueries({ queryKey: ['teacher-detail', id] })
    } catch (err: any) {
      notify.error(err.message || 'Failed to reset credentials')
    } finally {
      setIsResetting(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify.error('Please upload a valid image file')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 400
        let { width, height } = img
        if (width > height) {
          if (width > MAX) { height *= MAX / width; width = MAX }
        } else {
          if (height > MAX) { width *= MAX / height; height = MAX }
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        setPreviewImage(dataUrl)
        setValue('profilePicture', dataUrl, { shouldDirty: true })
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleAddClassAssignment = async () => {
    if (!placementReady) {
      notify.error(
        houseRequired
          ? 'Select campus, batch, and performance house before assigning classes'
          : 'Select campus and batch before assigning classes'
      )
      return
    }
    if (!assignClassId) {
      notify.error('Select a class to assign')
      return
    }
    setIsAssigning(true)
    try {
      // WHY classSectionId: The new Academic Engine uses ClassSection + SubjectOffering
      // instead of the legacy Class + ClassTeacher models. This ensures Evening/Night
      // classes are properly assigned.
      await fetchApi(`/api/teachers/${id}/classes`, {
        method: 'POST',
        body: JSON.stringify({
          classSectionId: assignClassId,
          isClassTeacher: assignAsIncharge,
          academicYear: assignYear,
        }),
      })
      notify.success('Class assignment added')
      setAssignClassId('')
      setAssignAsIncharge(false)
      refetchAssignments()
      queryClient.invalidateQueries({ queryKey: ['teacher-detail', id] })
    } catch (err: any) {
      notify.error(err.message || 'Failed to assign class')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRemoveAssignment = async (
    assignment: { classId?: string; classSectionId?: string; source?: string },
    academicYear: string,
    className: string
  ) => {
    if (!confirm(`Remove assignment to ${className}?`)) return
    try {
      // Send the right identifier depending on the assignment source
      const payload: Record<string, string> = { academicYear }
      if (assignment.classSectionId) {
        payload.classSectionId = assignment.classSectionId
      } else if (assignment.classId) {
        payload.classId = assignment.classId
      }
      await fetchApi(`/api/teachers/${id}/classes`, {
        method: 'DELETE',
        body: JSON.stringify(payload),
      })
      notify.success('Class assignment removed')
      refetchAssignments()
      queryClient.invalidateQueries({ queryKey: ['teacher-detail', id] })
    } catch (err: any) {
      notify.error(err.message || 'Failed to remove assignment')
    }
  }

  const onSubmit = async (data: EditForm) => {
    // Manual required-field checks (no zodResolver — see useForm comment above)
    if (!data.campusId) {
      notify.error('Campus is required — please select a campus before saving.')
      return
    }
    if (data.batchId && houseRequired && !data.houseId) {
      notify.error('Performance house is required for this batch')
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        ...data,
        dateOfBirth: toIsoString(data.dateOfBirth),
        joiningDate: toIsoString(data.joiningDate),
        batchId: data.batchId || null,
        houseId: data.houseId || null,
      }
      await fetchApi(`/api/teachers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      notify.success('Teacher profile updated successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      router.push('/dashboard/teachers')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.hasFieldErrors) {
        // Map server field-level errors back to form fields for inline display
        err.fieldErrors.forEach(({ field, message }) => {
          const knownField = field as keyof EditForm
          if (knownField) {
            setError(knownField, { type: 'server', message })
          }
        })
        notify.error('Validation failed — check the highlighted fields', {
          description: err.message,
        })
      } else {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred'
        notify.error('Failed to update teacher', { description: message })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const field = (name: keyof EditForm) => ({
    ...register(name),
    className: errors[name] ? 'border-destructive' : '',
  })

  const fieldErr = (name: keyof EditForm) =>
    errors[name] && (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {String(errors[name]?.message)}
      </p>
    )

  // ── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-10 w-full" />)}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !teacher) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 text-center text-sm text-destructive">
            Failed to load teacher profile. The record may have been deleted.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/teachers">
          <Button variant="outline" size="icon" className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit Staff Profile</h1>
          <p className="text-sm text-gray-500">
            {teacher.firstName} {teacher.lastName} — {teacher.employeeId}
          </p>
        </div>
        <div className="ml-auto">
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              watch('isActive') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {watch('isActive') ? 'Active' : 'Suspended'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Personal Details ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4 text-indigo-600" />
              Personal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Profile Picture */}
            <div className="flex items-center gap-6 pb-4 border-b border-gray-100">
              <div className="relative w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden flex items-center justify-center bg-gray-50 group cursor-pointer hover:border-indigo-500 transition-colors flex-shrink-0">
                {previewImage ? (
                  <img src={previewImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-2">
                    <User className="w-6 h-6 mx-auto text-gray-300" />
                    <span className="text-[9px] text-gray-400 block mt-1 uppercase tracking-wider">Photo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-bold">Change</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Profile Photo</p>
                <p className="text-xs text-gray-400 mt-0.5">Click to replace. JPEG, PNG accepted.</p>
                <p className="text-[10px] text-gray-300 mt-2 font-mono">CNIC: {teacher.cnic} (immutable)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input {...field('firstName')} />{fieldErr('firstName')}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input {...field('lastName')} />{fieldErr('lastName')}
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" {...field('dateOfBirth')} />{fieldErr('dateOfBirth')}
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select
                  value={genderValue || 'MALE'}
                  onValueChange={(v) => setValue('gender', v as 'MALE' | 'FEMALE', { shouldDirty: true, shouldValidate: true })}
                >
                  <SelectTrigger className={errors.gender ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
                {fieldErr('gender')}
              </div>
              <div className="space-y-1.5">
                <Label>Joining Date</Label>
                <Input type="date" {...field('joiningDate')} />{fieldErr('joiningDate')}
              </div>
              <div className="space-y-1.5 flex items-end gap-3">
                <div className="flex-1">
                  <Label>Account Status</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setValue('isActive', true, { shouldDirty: true })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-all ${
                        watch('isActive')
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('isActive', false, { shouldDirty: true })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-all ${
                        !watch('isActive')
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-red-400'
                      }`}
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Contact Details ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="w-4 h-4 text-indigo-600" />
              Contact &amp; Address
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Address</Label>
              <Input {...field('address')} />{fieldErr('address')}
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input {...field('city')} />{fieldErr('city')}
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input {...field('phoneNumber')} placeholder="+92..." />{fieldErr('phoneNumber')}
            </div>
            <div className="space-y-1.5">
              <Label>Email (Contact)</Label>
              <Input type="email" {...field('email')} />{fieldErr('email')}
            </div>
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input {...field('emergencyContact')} placeholder="+92..." />{fieldErr('emergencyContact')}
            </div>
          </CardContent>
        </Card>

        {/* ── Professional Details ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              Professional Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Qualification</Label>
              <Input {...field('qualification')} placeholder="M.Ed, B.Sc, MA..." />{fieldErr('qualification')}
            </div>
            <div className="space-y-1.5">
              <Label>Specialization</Label>
              <Input {...field('specialization')} placeholder="Mathematics, Biology..." />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Select
                value={designationValue || 'Teacher'}
                onValueChange={(v) => setValue('designation', v, { shouldDirty: true, shouldValidate: true })}
              >
                <SelectTrigger className={errors.designation ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErr('designation')}
            </div>
            {designationValue === 'Other' && (
              <div className="space-y-1.5">
                <Label>Custom Designation</Label>
                <Input
                  placeholder="e.g. Lab Assistant, Peon, Driver..."
                  onChange={(e) => {
                    // When Other is selected, overwrite designation with custom text on save
                    // Store in a data attribute for submission
                  }}
                  className="border-amber-300 bg-amber-50/30"
                />
                <p className="text-[10px] text-amber-600">This custom designation will be saved when you update the profile.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Years of Experience</Label>
              <Input type="number" min={0} {...field('experienceYears')} />{fieldErr('experienceYears')}
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Salary (Rs) — optional</Label>
              <Input type="number" min={0} {...register('monthlySalary', { valueAsNumber: true })} />
            </div>
          </CardContent>
        </Card>

        {/* Placement */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              Campus Placement
            </CardTitle>
            <CardDescription className="text-xs">
              Primary campus and batch for this teacher. Class assignments (Morning/Evening) are managed below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CampusBatchHouseFields
              campusId={selectedCampusId}
              batchId={selectedBatchId}
              houseId={selectedHouseId}
              campuses={campuses}
              batches={batches}
              houses={houses}
              isLoadingBatches={isLoadingBatches}
              isLoadingHouses={isLoadingHouses}
              campusError={errors.campusId?.message}
              batchError={errors.batchId?.message}
              houseError={
                houseRequired && selectedBatchId && !selectedHouseId
                  ? 'Performance house is required for this batch'
                  : undefined
              }
              onCampusChange={(v) => {
                setValue('campusId', v, { shouldDirty: true, shouldValidate: true })
                setValue('batchId', '', { shouldDirty: true, shouldValidate: true })
                setValue('houseId', '', { shouldDirty: true })
                setAssignClassId('')
              }}
              onBatchChange={(v) => {
                setValue('batchId', v, { shouldDirty: true, shouldValidate: true })
                setValue('houseId', '', { shouldDirty: true })
                setAssignClassId('')
              }}
              onHouseChange={(v) => setValue('houseId', v, { shouldDirty: true, shouldValidate: true })}
            />

            <div className="space-y-1.5">
              <Label>Coaching sessions (from class assignments)</Label>
              <div className="flex flex-wrap gap-2 min-h-[32px] items-center">
                {assignedShifts.length > 0 ? (
                  assignedShifts.map((s) => (
                    <span
                      key={s}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${SESSION_SHIFT_BADGE_CLASS[s]}`}
                    >
                      {SESSION_SHIFT_LABELS[s]}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 italic">No class assignments yet — add Morning, Evening, or Night classes below</span>
                )}
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Class assignments — Morning / Evening / Night */}
        <Card className="border-indigo-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              Class Assignments (All Shifts)
            </CardTitle>
            <CardDescription className="text-xs">
              Assign this teacher to Morning, Evening, or Night coaching classes. Each shift is a separate class section.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {classAssignments.length > 0 ? (
              <div className="space-y-2">
                {classAssignments.map((a: {
                  id: string
                  source?: 'legacy' | 'academic_engine'
                  classId?: string
                  classSectionId?: string
                  className: string
                  sectionName?: string
                  shift?: SessionShift
                  shiftLabel?: string
                  grade?: number | null
                  academicYear: string
                  isClassTeacher: boolean
                  campusName?: string
                  batchName?: string
                  studentCount?: number
                  deliveryMode?: string
                }) => {
                  const displayName = a.sectionName
                    ? `${a.className}-${a.sectionName}`
                    : a.className
                  const shiftCode = a.shift as SessionShift | undefined
                  return (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border bg-gray-50/80"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {formatClassWithShift(displayName, shiftCode)}
                        </span>
                        {shiftCode && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SESSION_SHIFT_BADGE_CLASS[shiftCode]}`}>
                            {SESSION_SHIFT_LABELS[shiftCode]}
                          </span>
                        )}
                        {a.deliveryMode && a.deliveryMode !== 'PHYSICAL' && (
                          <span className="text-[9px] bg-cyan-100 text-cyan-800 border border-cyan-200 px-1.5 py-0.5 rounded-full font-bold">
                            {a.deliveryMode === 'ONLINE' ? '💻 Online' : '🔄 Hybrid'}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{a.academicYear}</span>
                        {a.isClassTeacher && (
                          <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold">INCHARGE</span>
                        )}
                        {a.studentCount !== undefined && a.studentCount > 0 && (
                          <span className="text-[10px] text-gray-400">{a.studentCount} students</span>
                        )}
                        {a.source === 'legacy' && (
                          <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Legacy</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 h-8"
                        onClick={() => handleRemoveAssignment(
                          { classId: a.classId, classSectionId: a.classSectionId, source: a.source },
                          a.academicYear,
                          displayName
                        )}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No classes assigned for this academic year.</p>
            )}

            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Add class assignment</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Session</Label>
                  <Select value={assignShift} onValueChange={(v) => { setAssignShift(v as SessionShift); setAssignClassId('') }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* WHY dynamic: Renders all shifts from the canonical SESSION_SHIFT_LABELS
                          map instead of hardcoding. This ensures NIGHT shift is always visible. */}
                      {(Object.keys(SESSION_SHIFT_LABELS) as SessionShift[]).map((code) => (
                        <SelectItem key={code} value={code}>{SESSION_SHIFT_LABELS[code]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Class Section</Label>
                  <Select
                    value={assignClassId || undefined}
                    disabled={!placementReady || availableClasses.length === 0}
                    onValueChange={setAssignClassId}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={
                        !selectedCampusId
                          ? 'Select campus above'
                          : availableClasses.length === 0
                            ? `No ${SESSION_SHIFT_LABELS[assignShift]?.replace(/[^\w\s]/g, '').trim().toLowerCase()} classes${selectedBatchId ? ' for this batch' : ''} — create them in Academic Engine`
                            : 'Select class section'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClasses.map((sec: { id: string; className: string; sectionName: string; shift?: { code?: string; name?: string }; deliveryMode?: string; _count?: { enrollments: number } }) => (
                        <SelectItem key={sec.id} value={sec.id}>
                          {sec.className}-{sec.sectionName}
                          {sec.shift?.name ? ` · ${sec.shift.name}` : ''}
                          {sec.deliveryMode && sec.deliveryMode !== 'PHYSICAL' ? ` (${sec.deliveryMode})` : ''}
                          {sec._count?.enrollments ? ` — ${sec._count.enrollments} students` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Academic year</Label>
                  <Input
                    className="h-9 text-xs"
                    value={assignYear}
                    onChange={(e) => setAssignYear(e.target.value)}
                    placeholder="2025-2026"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignAsIncharge}
                    onChange={(e) => setAssignAsIncharge(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700">Class teacher (incharge)</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={isAssigning || !assignClassId}
                  className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleAddClassAssignment}
                >
                  {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Assign Class
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pb-10">
          <Link href="/dashboard/teachers">
            <Button type="button" variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSaving}
            className="gap-2 px-6 min-w-[160px]"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Administrative User Credentials Reset Card */}
      <Card className="mt-8 rounded-xl border border-rose-200 shadow-md bg-rose-50/20 overflow-hidden">
        <CardHeader className="border-b border-rose-100 bg-rose-50/50 py-4 flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-100 text-rose-700 flex-shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-sm font-black text-rose-900">Administrative Login Credentials Reset</CardTitle>
            <CardDescription className="text-xs text-rose-700/80">Change or reset this teacher's active dashboard login credentials (email & password).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCredentialsReset} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-rose-900">Dashboard Email</Label>
              <Input 
                type="email" 
                value={resetEmail} 
                onChange={(e) => setResetEmail(e.target.value)} 
                required 
                className="text-xs h-9 border-rose-200 focus-visible:ring-rose-500 bg-white" 
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-rose-900">New Password</Label>
              <Input 
                type="password" 
                value={resetPassword} 
                onChange={(e) => setResetPassword(e.target.value)} 
                placeholder="•••••••• (Min 8 chars)" 
                className="text-xs h-9 border-rose-200 focus-visible:ring-rose-500 bg-white" 
              />
            </div>
            <div>
              <Button 
                type="submit" 
                disabled={isResetting}
                className="w-full text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2 shadow-sm"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    Reset Credentials
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
