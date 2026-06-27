'use client'

import { useState } from 'react'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import { useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { fetchApi, ApiError } from '@/lib/api-client'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { createStudentSchema, CreateStudentInput } from '@/lib/validation/student'
import { SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import { GUARDIAN_EMPLOYMENT_STATUSES, ACADEMIC_GROUPS, MARKETING_SOURCES, ACADEMIC_LEVELS } from '@/app/admissions/apply/_components'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, AlertCircle, Loader2, UserPlus, Info } from 'lucide-react'
import Link from 'next/link'

type Campus = { id: string; name: string }
type Batch = { id: string; name: string }
type House = { id: string; name: string }
type SectionData = {
  id: string
  className: string
  sectionName: string
  shift: { code: SessionShift; name: string }
  _count?: { enrollments: number }
}

type QueryResult<T> = T | { data?: T }

// ─── Field Error Helper ───────────────────────────────────────────────────────
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      {message}
    </p>
  )
}

// ─── Required Label Helper ────────────────────────────────────────────────────
function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label>
      {children} <span className="text-destructive">*</span>
    </Label>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdmissionPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [serverErrors, setServerErrors] = useState<{ field: string; message: string }[]>([])
  const [enrollmentStatus, setEnrollmentStatus] = useState<'none' | 'enrolled' | 'skipped'>('none')
  // Change 1: global client-side validation error summary
  const [validationErrors, setValidationErrors] = useState<{ field: string; label: string }[]>([])
  // Change 2: level/gender-based campus separation
  const [studentLevel, setStudentLevel] = useState<'primary' | 'senior' | null>(null)
  const [seniorCampusGender, setSeniorCampusGender] = useState<'BOYS' | 'GIRLS' | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    setError,
    formState: { errors },
  } = useForm<CreateStudentInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      nationality: 'Pakistani',
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      totalFeeAmount: 0, // WHY 0: Fees are set by the Super Admin — no hardcoded defaults
      requestedCourses: [],
      requestedLevel: '',
      requestedClass: undefined,
      requestedGroup: '',
      requestedGroupOther: '',
      requestedCoursesOther: '',
      interviewInstitute: '',
      interviewMarksObtained: undefined,
      interviewPercentage: '',
      interviewYear: undefined,
      interviewGroup: '',
    },
  })

  const selectedCampusId = useWatch({ control, name: 'campusId' })
  const selectedBatchId = useWatch({ control, name: 'batchId' })
  const selectedSectionId = useWatch({ control, name: 'classSectionId' })
  const requestedCourses = useWatch({ control, name: 'requestedCourses' }) ?? []
  const requestedGroup = useWatch({ control, name: 'requestedGroup' })
  const hasDisability = useWatch({ control, name: 'hasDisability' })
  const hasSiblingAtAcademy = useWatch({ control, name: 'hasSiblingAtAcademy' })
  const guardianEmploymentStatus = useWatch({ control, name: 'guardianEmploymentStatus' })

  // ── Data Fetching ────────────────────────────────────────────────────────
  const { data: campusesRaw } = useQuery<QueryResult<Campus[]>>({
    queryKey: ['campuses'],
    queryFn: () => fetchApi<Campus[]>('/api/campuses'),
  })
  const campuses = Array.isArray(campusesRaw) ? campusesRaw : campusesRaw?.data || []

  // CHANGE 2: Filter campus list based on selected student level and gender.
  // Falls back to all campuses if no keyword matches (handles generic campus names).
  const filteredCampuses = (() => {
    if (studentLevel === 'senior' && seniorCampusGender) {
      const keywords = seniorCampusGender === 'BOYS'
        ? ['boy', 'male', 'gents', 'bros']
        : ['girl', 'female', 'ladies', 'sis']
      const filtered = campuses.filter((c: Campus) =>
        keywords.some(kw => c.name.toLowerCase().includes(kw))
      )
      return filtered.length > 0 ? filtered : campuses
    }
    return campuses
  })()

  const { data: batchesRaw } = useQuery<QueryResult<Batch[]>>({
    queryKey: ['batches', selectedCampusId],
    queryFn: () => fetchApi<Batch[]>(`/api/batches?campusId=${selectedCampusId}`),
    enabled: !!selectedCampusId,
  })
  const batches = Array.isArray(batchesRaw) ? batchesRaw : batchesRaw?.data || []

  const { data: sectionsRaw, isLoading: sectionsLoading } = useQuery<QueryResult<SectionData[]>>({
    queryKey: ['admission-sections', selectedCampusId, selectedBatchId],
    queryFn: () => {
      const p = new URLSearchParams()
      if (selectedCampusId) p.set('campusId', selectedCampusId)
      if (selectedBatchId) p.set('batchId', selectedBatchId)
      return fetchApi<SectionData[]>(`/api/class-sections?${p}`)
    },
    enabled: !!selectedCampusId && !!selectedBatchId,
  })

  const sections = Array.isArray(sectionsRaw) ? sectionsRaw : sectionsRaw?.data ?? []

  const { data: housesRaw } = useQuery<QueryResult<House[]>>({
    queryKey: ['houses', selectedBatchId],
    queryFn: () => fetchApi<House[]>(`/api/houses?batchId=${selectedBatchId}`),
    enabled: !!selectedBatchId,
  })
  const houses = Array.isArray(housesRaw) ? housesRaw : housesRaw?.data ?? []

  const [previewImage, setPreviewImage] = useState<string | null>(null)

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
        if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
        else { if (height > MAX) { width *= MAX / height; height = MAX } }
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        setPreviewImage(dataUrl)
        setValue('profilePicture', dataUrl)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // ── Submit Handler ───────────────────────────────────────────────────────
  const onSubmit = async (data: CreateStudentInput) => {
    setIsLoading(true)
    setServerErrors([])
    setValidationErrors([])
    setEnrollmentStatus('none')

    try {
      const result = await fetchApi<{
        id: string
        registrationNumber: string
        enrollmentId?: string | null
        guardianId?: string | null
        enrollmentNote?: string
        guardianNote?: string
      }>('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          dateOfBirth: new Date(data.dateOfBirth).toISOString(),
        }),
      })

      const didEnroll = !!result.enrollmentId
      setEnrollmentStatus(didEnroll ? 'enrolled' : 'skipped')

      // Primary success toast
      notify.success(`Student admitted successfully!`, {
        description: `Registration No: ${result.registrationNumber}`,
        duration: 6000,
      })

      // Warn about partial failures (non-fatal)
      if (result.enrollmentNote) {
        notify.warning('Enrollment note', { description: result.enrollmentNote, duration: 8000 })
      }
      if (result.guardianNote) {
        notify.warning('Guardian setup note', { description: result.guardianNote, duration: 8000 })
      }

      queryClient.invalidateQueries({ queryKey: ['students'] })
      router.push('/dashboard/students')
    } catch (err) {
      if (err instanceof ApiError) {
        // Map server field errors back to the form so they appear inline
        if (err.hasFieldErrors) {
          const unmapped: { field: string; message: string }[] = []

          err.fieldErrors.forEach(({ field, message }) => {
            // react-hook-form only accepts known field paths
            const knownFields: (keyof CreateStudentInput)[] = [
              'firstName', 'lastName', 'fatherName', 'cnicBForm', 'dateOfBirth', 'gender',
              'address', 'city', 'province', 'phoneNumber', 'emergencyContact', 'email',
              'campusId', 'batchId', 'classSectionId', 'rollNumber', 'academicYear',
              'totalFeeAmount', 'requestedLevel', 'requestedClass', 'requestedGroup', 'requestedGroupOther', 'requestedCourses', 'requestedCoursesOther',
              'interviewInstitute', 'interviewGroup', 'interviewMarksObtained', 'interviewPercentage', 'interviewYear', 'interviewDate', 'interviewerName', 'interviewOutcome', 'interviewNotes',
              'guardianFirstName', 'guardianCnic', 'guardianPhone',
              'guardianEmail', 'guardianRelationship',
            ]

            if (knownFields.includes(field as keyof CreateStudentInput)) {
              setError(field as keyof CreateStudentInput, { type: 'server', message })
            } else {
              unmapped.push({ field, message })
            }
          })

          setServerErrors(unmapped)

          notify.error('Please fix the highlighted fields', {
            description: `${err.fieldErrors.length} validation error${err.fieldErrors.length > 1 ? 's' : ''} found`,
          })
        } else if (err.status === 409) {
          // Duplicate CNIC — map to the field
          setError('cnicBForm', { type: 'server', message: err.message })
          notify.error('Duplicate record', { description: err.message })
        } else {
          notify.error('Admission failed', { description: err.message })
        }
      } else {
        notify.error('Unexpected error', { description: 'Please try again or contact support.' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // CHANGE 1: Collect Zod field errors on invalid submit, show summary banner.
  // WHY: react-hook-form's second arg to handleSubmit fires when validation fails.
  // This gives the super admin a single scannable list of missing required fields.
  const FIELD_LABELS: Partial<Record<keyof CreateStudentInput, string>> = {
    firstName: 'First Name',
    lastName: 'Last Name',
    fatherName: "Father's Name",
    cnicBForm: 'Student B-Form / CNIC',
    dateOfBirth: 'Date of Birth',
    gender: 'Gender',
    address: 'Full Address',
    city: 'City',
    province: 'Province',
    phoneNumber: 'Phone Number',
    emergencyContact: 'Emergency Contact',
    campusId: 'Campus',
    batchId: 'Batch',
    academicYear: 'Academic Year',
    totalFeeAmount: 'Total Monthly Fee Amount',
    rollNumber: 'Roll Number',
  }

  const onInvalid = (errors: FieldErrors<CreateStudentInput>) => {
    const list: { field: string; label: string }[] = []
    Object.entries(errors).forEach(([field]) => {
      list.push({
        field,
        label: FIELD_LABELS[field as keyof CreateStudentInput] ?? field,
      })
    })
    setValidationErrors(list)
    // Scroll to the top so the banner is immediately visible
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/students">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Student Admission</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete all required fields (<span className="text-destructive font-medium">*</span>) to admit a student. Section selection automatically creates an Academic Engine enrollment.
          </p>
        </div>
      </div>

      {/* CHANGE 1: Global client-side validation error banner — lists every missing required field */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive" id="validation-error-banner">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Please complete all required fields before submitting</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {validationErrors.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold">{e.label}</span> is required or invalid
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Global server-side error banner (for non-field errors) */}
      {serverErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Additional server errors</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-1">
              {serverErrors.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{e.field}:</span> {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Enrollment status feedback */}
      {enrollmentStatus === 'skipped' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No section selected</AlertTitle>
          <AlertDescription>
            Student was admitted without an Academic Engine enrollment. You can add one later from the student profile.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">

        {/* ── Personal Details ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Personal Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Profile picture */}
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="relative w-32 h-32 rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center bg-muted flex-shrink-0 group">
                {previewImage ? (
                  <NextImage src={previewImage} alt="Preview" fill className="object-cover" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <UserPlus className="w-8 h-8 mx-auto mb-1 opacity-40" />
                    <span className="text-xs">Upload Photo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">Change</span>
                </div>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              <div className="flex flex-col justify-center">
                <h3 className="font-medium">Student Profile Photo</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Passport-size photo recommended. Auto-compressed for ID cards and certificates.
                </p>
                <FieldError message={errors.profilePicture?.message} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <RequiredLabel>First Name</RequiredLabel>
                <Input {...register('firstName')} className={errors.firstName ? 'border-destructive focus-visible:ring-destructive' : ''} placeholder="e.g. Muhammad" />
                <FieldError message={errors.firstName?.message} />
              </div>
              <div className="space-y-1.5">
                <RequiredLabel>Last Name</RequiredLabel>
                <Input {...register('lastName')} className={errors.lastName ? 'border-destructive focus-visible:ring-destructive' : ''} placeholder="e.g. Ahmed" />
                <FieldError message={errors.lastName?.message} />
              </div>
              <div className="space-y-1.5">
                <RequiredLabel>Father&apos;s Name</RequiredLabel>
                <Input {...register('fatherName')} className={errors.fatherName ? 'border-destructive focus-visible:ring-destructive' : ''} placeholder="Father&apos;s full name" />
                <FieldError message={errors.fatherName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label>Mother&apos;s Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input {...register('motherName')} placeholder="Mother&apos;s full name" />
              </div>
              <div className="space-y-1.5">
                <Label>Father&apos;s CNIC (13 digits)</Label>
                <Input {...register('fatherCnic')} placeholder="3520123456789" maxLength={13} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Father&apos;s Occupation</Label>
                <Input {...register('fatherOccupation')} placeholder="e.g. Teacher, Business" />
              </div>
              <div className="space-y-1.5">
                <Label>Father&apos;s Qualification</Label>
                <Input {...register('fatherQualification')} placeholder="e.g. Graduate, Matric" />
              </div>
              <div className="space-y-1.5 md:col-span-2 border-t pt-4 mt-2">
                <h4 className="font-semibold text-sm mb-2 text-slate-700">Identity & Demographic Info</h4>
              </div>
              <div className="space-y-1.5">
                <RequiredLabel>Student B-Form / CNIC (13 digits, no dashes)</RequiredLabel>
                <Input {...register('cnicBForm')} placeholder="3520123456789" maxLength={13} className={errors.cnicBForm ? 'border-destructive focus-visible:ring-destructive font-mono' : 'font-mono'} />
                <FieldError message={errors.cnicBForm?.message} />
              </div>
              <div className="space-y-1.5">
                <RequiredLabel>Date of Birth</RequiredLabel>
                <Input type="date" {...register('dateOfBirth')} className={errors.dateOfBirth ? 'border-destructive focus-visible:ring-destructive' : ''} />
                <FieldError message={errors.dateOfBirth?.message} />
              </div>
              <div className="space-y-1.5">
                <RequiredLabel>Gender</RequiredLabel>
                <Select onValueChange={(val) => setValue('gender', val as 'MALE' | 'FEMALE')}>
                  <SelectTrigger className={errors.gender ? 'border-destructive focus:ring-destructive' : ''}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={errors.gender?.message} />
              </div>
              <div className="space-y-1.5">
                <Label>Blood Group <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Select onValueChange={(val) => setValue('bloodGroup', val as CreateStudentInput['bloodGroup'])}>
                  <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                  <SelectContent>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Religion <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input {...register('religion')} placeholder="e.g. Islam" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Contact & Address ── */}
        <Card>
          <CardHeader><CardTitle>Contact & Address</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <RequiredLabel>Full Address</RequiredLabel>
              <Input {...register('address')} placeholder="Street, area, locality" className={errors.address ? 'border-destructive focus-visible:ring-destructive' : ''} />
              <FieldError message={errors.address?.message} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Permanent Address <span className="text-muted-foreground text-xs">(If different)</span></Label>
              <Input {...register('permanentAddress')} placeholder="Enter permanent address" />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>City</RequiredLabel>
              <Input {...register('city')} placeholder="e.g. Faisalabad" className={errors.city ? 'border-destructive focus-visible:ring-destructive' : ''} />
              <FieldError message={errors.city?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Tehsil</Label>
              <Input {...register('tehsil')} placeholder="e.g. City / Saddar" />
            </div>
            <div className="space-y-1.5">
              <Label>District</Label>
              <Input {...register('district')} placeholder="e.g. Faisalabad" />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>Province</RequiredLabel>
              <Input {...register('province')} placeholder="e.g. Punjab" className={errors.province ? 'border-destructive focus-visible:ring-destructive' : ''} />
              <FieldError message={errors.province?.message} />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>Phone Number</RequiredLabel>
              <Input {...register('phoneNumber')} placeholder="+923001234567" className={errors.phoneNumber ? 'border-destructive focus-visible:ring-destructive' : ''} />
              <FieldError message={errors.phoneNumber?.message} />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>Emergency Contact</RequiredLabel>
              <Input {...register('emergencyContact')} placeholder="+923001234567" className={errors.emergencyContact ? 'border-destructive focus-visible:ring-destructive' : ''} />
              <FieldError message={errors.emergencyContact?.message} />
            </div>
          </CardContent>
        </Card>

        {/* ── Previous Academic Record ── */}
        <Card>
          <CardHeader><CardTitle>Previous Academic Record</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Previous School Name</Label>
              <Input {...register('previousSchool')} placeholder="e.g. Allied School" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Class Passed</Label>
              <Input type="number" min={1} max={12} {...register('lastClassPassed', { valueAsNumber: true })} placeholder="e.g. 8" />
            </div>
            <div className="space-y-1.5">
              <Label>Percentage / Grade</Label>
              <Input {...register('lastPercentage')} placeholder="e.g. 85%" />
            </div>
            <div className="space-y-1.5">
              <Label>Marks Obtained</Label>
              <Input type="number" min={0} {...register('previousMarksObtained', { valueAsNumber: true })} placeholder="e.g. 750" />
            </div>
            <div className="space-y-1.5">
              <Label>Previous Group</Label>
              <Input {...register('previousGroup')} placeholder="e.g. Science" />
            </div>
            <div className="space-y-1.5">
              <Label>Board / University</Label>
              <Input {...register('boardName')} placeholder="e.g. BISE Faisalabad" />
            </div>
            <div className="space-y-1.5">
              <Label>Year of Passing</Label>
              <Input type="number" min={1990} max={new Date().getFullYear()} {...register('yearOfPassing', { valueAsNumber: true })} placeholder={new Date().getFullYear().toString()} />
            </div>
            <div className="space-y-1.5 md:col-span-2 border-t pt-4 mt-2">
              <h4 className="font-semibold text-sm mb-2 text-slate-700">Requested Placement</h4>
            </div>
            <div className="space-y-1.5">
              <Label>Requested Academic Level</Label>
              <Select onValueChange={(val) => setValue('requestedLevel', val)}>
                <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  {ACADEMIC_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.requestedLevel?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Requested Class</Label>
              <Input type="number" min={1} max={12} {...register('requestedClass', { valueAsNumber: true })} placeholder="e.g. 9" />
              <FieldError message={errors.requestedClass?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Group / Courses</Label>
              <Select onValueChange={(val) => setValue('requestedGroup', val)}>
                <SelectTrigger><SelectValue placeholder="Select Group" /></SelectTrigger>
                <SelectContent>
                  {ACADEMIC_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError message={errors.requestedGroup?.message} />
            </div>
            {requestedGroup === 'Other' && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>Other Group</Label>
                <Input {...register('requestedGroupOther')} placeholder="Describe the requested group" />
                <FieldError message={errors.requestedGroupOther?.message} />
              </div>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Course Interests</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ACADEMIC_GROUPS.map((course) => {
                  const selected = requestedCourses.includes(course)
                  return (
                    <label key={course} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer select-none hover:border-slate-400">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const next = selected
                            ? requestedCourses.filter((item: string) => item !== course)
                            : [...requestedCourses, course]
                          setValue('requestedCourses', next)
                        }}
                        className="h-4 w-4"
                      />
                      <span>{course}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            {requestedCourses.includes('Other') && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>Other Course Interests</Label>
                <Input {...register('requestedCoursesOther')} placeholder="Describe additional course interests" />
                <FieldError message={errors.requestedCoursesOther?.message} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Repeater Subjects</Label>
              <Input {...register('repeaterSubjects')} placeholder="e.g. Physics, Chemistry" />
            </div>
          </CardContent>
        </Card>

        {/* ── Interview & Assessment ── */}
        <Card>
          <CardHeader>
            <CardTitle>Interview & Assessment</CardTitle>
            <CardDescription>
              Capture the interview details, assessment outcome, and any internal notes.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Interview Institute</Label>
              <Input {...register('interviewInstitute')} placeholder="Name of school or college" />
            </div>
            <div className="space-y-1.5">
              <Label>Interview Group</Label>
              <Input {...register('interviewGroup')} placeholder="e.g. Science, Arts" />
            </div>
            <div className="space-y-1.5">
              <Label>Marks Obtained</Label>
              <Input type="number" min={0} {...register('interviewMarksObtained', { valueAsNumber: true })} placeholder="e.g. 850" />
            </div>
            <div className="space-y-1.5">
              <Label>Percentage</Label>
              <Input {...register('interviewPercentage')} placeholder="e.g. 76.5%" />
            </div>
            <div className="space-y-1.5">
              <Label>Interview Year</Label>
              <Input type="number" min={1900} max={new Date().getFullYear()} {...register('interviewYear', { valueAsNumber: true })} placeholder="e.g. 2025" />
            </div>
            <div className="space-y-1.5">
              <Label>Interview Date</Label>
              <Input type="date" {...register('interviewDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Interviewer Name</Label>
              <Input {...register('interviewerName')} placeholder="e.g. Admissions Officer" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Interview Outcome</Label>
              <Input {...register('interviewOutcome')} placeholder="e.g. Pass, Follow-up, Reject" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Interview Notes</Label>
              <textarea {...register('interviewNotes')} rows={4} className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Add internal assessment notes or next-step recommendations" />
            </div>
          </CardContent>
        </Card>

        {/* ── Medical & Additional ── */}
        <Card>
          <CardHeader><CardTitle>Medical & Additional Info</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Medical Conditions / Allergies</Label>
              <Input {...register('medicalConditions')} placeholder="List any chronic conditions or allergies (if any)" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mt-8">
                <input type="checkbox" id="hasDisability" className="w-4 h-4" {...register('hasDisability')} />
                <Label htmlFor="hasDisability" className="cursor-pointer">Has any physical or learning disability?</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Disability Details <span className="text-muted-foreground text-xs">(if applicable)</span></Label>
              <Input {...register('disabilityDetails')} placeholder="Provide details if yes" disabled={!hasDisability} />
            </div>
            <div className="space-y-1.5 border-t pt-4 mt-2">
              <div className="flex items-center gap-2 mt-4">
                <input type="checkbox" id="hasSibling" className="w-4 h-4" {...register('hasSiblingAtAcademy')} />
                <Label htmlFor="hasSibling" className="cursor-pointer">Has sibling currently studying at academy?</Label>
              </div>
            </div>
            <div className="space-y-1.5 border-t pt-4 mt-2">
              <Label>Sibling Name & Class</Label>
              <div className="flex gap-2">
                <Input {...register('siblingName')} placeholder="Sibling Name" disabled={!hasSiblingAtAcademy} className="w-1/2" />
                <Input {...register('siblingClass')} placeholder="Class/Section" disabled={!hasSiblingAtAcademy} className="w-1/2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Academic & Financial ── */}
        <Card>
          <CardHeader>
            <CardTitle>Academic & Financial Placement</CardTitle>
            <CardDescription>
              Selecting a Class Section will automatically create a{' '}
              <Badge variant="secondary" className="text-xs">StudentEnrollment</Badge>{' '}
              in the active academic year.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* CHANGE 2: Student Level Selector — controls campus visibility and gender separation */}
            <div className="md:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Student Academic Level <span className="text-destructive">*</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select the level to determine campus options. Primary (up to Class 5) is co-educational. Senior (Class 6+) allows gender-separated campus selection.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Primary level button */}
                <button
                  type="button"
                  onClick={() => { setStudentLevel('primary'); setSeniorCampusGender(null); setValue('campusId', ''); setValue('batchId', ''); setValue('classSectionId', '') }}
                  className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-150 ${
                    studentLevel === 'primary'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-border bg-white hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    studentLevel === 'primary' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                  }`}>
                    {studentLevel === 'primary' && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <div className={`font-semibold text-sm ${studentLevel === 'primary' ? 'text-blue-900' : 'text-slate-800'}`}>Primary / Junior Level</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Up to Class 5 · Co-educational · No gender separation</div>
                  </div>
                </button>
                {/* Senior level button */}
                <button
                  type="button"
                  onClick={() => { setStudentLevel('senior'); setValue('campusId', ''); setValue('batchId', ''); setValue('classSectionId', '') }}
                  className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-150 ${
                    studentLevel === 'senior'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-border bg-white hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    studentLevel === 'senior' ? 'border-purple-500 bg-purple-500' : 'border-slate-300'
                  }`}>
                    {studentLevel === 'senior' && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <div className={`font-semibold text-sm ${studentLevel === 'senior' ? 'text-purple-900' : 'text-slate-800'}`}>Senior Level</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Class 6 and above · Gender-separated campuses available</div>
                  </div>
                </button>
              </div>

              {/* Gender campus type — only shown for senior level */}
              {studentLevel === 'senior' && (
                <div className="border-t border-slate-200 pt-3 mt-1">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Select Campus Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setSeniorCampusGender('BOYS'); setValue('campusId', ''); setValue('batchId', ''); setValue('classSectionId', '') }}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                        seniorCampusGender === 'BOYS'
                          ? 'border-sky-500 bg-sky-50 text-sky-800'
                          : 'border-border bg-white hover:border-slate-400'
                      }`}
                    >
                      <span aria-hidden>👦</span> Boys Campus
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSeniorCampusGender('GIRLS'); setValue('campusId', ''); setValue('batchId', ''); setValue('classSectionId', '') }}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                        seniorCampusGender === 'GIRLS'
                          ? 'border-pink-400 bg-pink-50 text-pink-800'
                          : 'border-border bg-white hover:border-slate-400'
                      }`}
                    >
                      <span aria-hidden>👧</span> Girls Campus
                    </button>
                  </div>
                  {seniorCampusGender && filteredCampuses.length === campuses.length && campuses.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-amber-600 mt-2">
                      <Info className="w-3 h-3" />
                      No campuses matched the gender filter by name — showing all campuses. Contact admin to label campus names with gender identifiers.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Campus — filtered by level/gender selection above */}
            <div className="space-y-1.5">
              <RequiredLabel>Campus</RequiredLabel>
              <Select
                disabled={!studentLevel}
                onValueChange={(val) => { setValue('campusId', val); setValue('batchId', ''); setValue('classSectionId', '') }}
              >
                <SelectTrigger className={errors.campusId ? 'border-destructive focus:ring-destructive' : ''}>
                  <SelectValue placeholder={!studentLevel ? 'Select student level first' : 'Select campus'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredCampuses.map((c: Campus) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.campusId?.message} />
            </div>

            {/* Batch */}
            <div className="space-y-1.5">
              <RequiredLabel>Batch</RequiredLabel>
              <Select
                disabled={!selectedCampusId}
                onValueChange={(val) => { setValue('batchId', val); setValue('classSectionId', ''); setValue('houseId', '') }}
              >
                <SelectTrigger className={errors.batchId ? 'border-destructive focus:ring-destructive' : ''}>
                  <SelectValue placeholder={!selectedCampusId ? 'Select campus first' : 'Select batch'} />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((b: { id: string; name: string }) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.batchId?.message} />
            </div>

            {/* Class Section — full width */}
            <div className="space-y-1.5 md:col-span-2">
              <Label>
                Class Section <span className="text-muted-foreground text-xs">(optional — creates enrollment)</span>
              </Label>
              <Select
                disabled={!selectedBatchId || sectionsLoading}
                onValueChange={(val) => {
                  setValue('classSectionId', val)
                  const sec = sections.find((s: SectionData) => s.id === val)
                  if (sec) setValue('shift', sec.shift.code)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    !selectedBatchId ? 'Select batch first' :
                    sectionsLoading ? 'Loading sections…' :
                    sections.length === 0 ? 'No sections found for this batch/campus' :
                    'Select class section'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s: SectionData) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-medium">{s.className}-{s.sectionName}</span>
                      <span className="text-muted-foreground ml-2 text-xs">· {SESSION_SHIFT_LABELS[s.shift.code]}</span>
                      {s._count?.enrollments !== undefined && (
                        <span className="text-muted-foreground ml-2 text-xs">({s._count.enrollments} students)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBatchId && sections.length === 0 && !sectionsLoading && (
                <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                  <Info className="w-3 h-3" />
                  No active class sections found. Create sections in Academic Engine first, or admit without a section.
                </p>
              )}
            </div>

            {/* Roll Number — required only if section selected */}
            <div className="space-y-1.5">
              <Label>
                Roll Number
                {selectedSectionId && <span className="text-destructive ml-1">*</span>}
                {!selectedSectionId && <span className="text-muted-foreground text-xs ml-1">(required if section selected)</span>}
              </Label>
              <Input
                {...register('rollNumber')}
                placeholder={selectedSectionId ? 'Required — e.g. 9321' : 'e.g. 9321'}
                className={errors.rollNumber ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              <FieldError message={errors.rollNumber?.message} />
            </div>

            {/* Session Shift — auto-filled when section selected */}
            <div className="space-y-1.5">
              <Label>Session Shift {selectedSectionId && <span className="text-xs text-muted-foreground">(auto-set from section)</span>}</Label>
              <Select
                onValueChange={(val) => setValue('shift', val as SessionShift)}
                defaultValue="MORNING"
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SESSION_SHIFT_LABELS) as SessionShift[]).map((code) => (
                    <SelectItem key={code} value={code}>{SESSION_SHIFT_LABELS[code]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* House */}
            <div className="space-y-1.5">
              <Label>House <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select onValueChange={(val) => setValue('houseId', val === 'NONE' ? undefined : val)}>
                <SelectTrigger><SelectValue placeholder="No house" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {houses.map((h: { id: string; name: string }) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Academic Year */}
            <div className="space-y-1.5">
              <RequiredLabel>Academic Year (YYYY-YYYY)</RequiredLabel>
              <Input
                {...register('academicYear')}
                placeholder="2026-2027"
                className={errors.academicYear ? 'border-destructive focus-visible:ring-destructive font-mono' : 'font-mono'}
              />
              <FieldError message={errors.academicYear?.message} />
            </div>

            {/* Total Fee */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex flex-col gap-2">
                <RequiredLabel>Total Monthly Fee Amount (Rs.)</RequiredLabel>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Suggested monthly fee</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">Admin-defined</div>
                  <p className="mt-2 text-xs text-slate-500">Fee amounts are set by the administration. Enter the approved monthly fee below based on the student's enrolled program and campus policy.</p>
                </div>
              </div>
              <Input
                type="number"
                min={0}
                {...register('totalFeeAmount', { valueAsNumber: true })}
                className={errors.totalFeeAmount ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              <FieldError message={errors.totalFeeAmount?.message} />
            </div>
          </CardContent>
        </Card>

        {/* ── Guardian / Parent ── */}
        <Card>
          <CardHeader>
            <CardTitle>Guardian / Parent</CardTitle>
            <CardDescription>
              Optional. Creates a guardian portal account with default password = CNIC digits. CNIC requires First Name.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Guardian First Name</Label>
              <Input {...register('guardianFirstName')} placeholder="e.g. Muhammad" />
              <FieldError message={errors.guardianFirstName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian Last Name</Label>
              <Input {...register('guardianLastName')} placeholder="e.g. Amer" />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian CNIC (13 digits, no dashes)</Label>
              <Input {...register('guardianCnic')} placeholder="3530123456789" maxLength={13} className={errors.guardianCnic ? 'border-destructive focus-visible:ring-destructive font-mono' : 'font-mono'} />
              <FieldError message={errors.guardianCnic?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian Phone</Label>
              <Input {...register('guardianPhone')} placeholder="+923001234567" />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian Email <span className="text-muted-foreground text-xs">(for portal login)</span></Label>
              <Input type="email" {...register('guardianEmail')} placeholder="guardian@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input {...register('guardianRelationship')} placeholder="Father / Mother / Guardian" />
            </div>
            <div className="space-y-1.5 border-t pt-4 mt-2 md:col-span-2">
              <h4 className="font-semibold text-sm mb-2 text-slate-700">Employment Information</h4>
            </div>
            <div className="space-y-1.5">
              <Label>Employment Status</Label>
              <Select onValueChange={(val) => setValue('guardianEmploymentStatus', val as 'GOVT' | 'PRIVATE' | 'BUSINESS' | 'NONE')}>
                <SelectTrigger><SelectValue placeholder="Select Employment" /></SelectTrigger>
                <SelectContent>
                  {GUARDIAN_EMPLOYMENT_STATUSES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {guardianEmploymentStatus === 'GOVT' || guardianEmploymentStatus === 'PRIVATE' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input {...register('guardianDesignation')} placeholder="e.g. Manager" />
                </div>
                <div className="space-y-1.5">
                  <Label>Organization</Label>
                  <Input {...register('guardianOrganization')} placeholder="e.g. WAPDA, PTCL" />
                </div>
              </>
            ) : guardianEmploymentStatus === 'BUSINESS' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Business Name</Label>
                  <Input {...register('guardianBusinessName')} placeholder="Name of business" />
                </div>
                <div className="space-y-1.5">
                  <Label>Deals In</Label>
                  <Input {...register('guardianBusinessDealsIn')} placeholder="Type of business (e.g. Textiles)" />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* ── Marketing ── */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>How did you come to know about us?</Label>
              <Select onValueChange={(val) => setValue('sourceOfInfo', val)}>
                <SelectTrigger><SelectValue placeholder="Select Source" /></SelectTrigger>
                <SelectContent>
                  {MARKETING_SOURCES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ── Submit ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-xs text-muted-foreground order-2 sm:order-1">
            Fields marked <span className="text-destructive font-bold">*</span> are required. Student login credentials are auto-generated.
          </p>
          <Button
            type="submit"
            disabled={isLoading}
            size="lg"
            className="w-full sm:w-auto order-1 sm:order-2 min-w-[220px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting admission…
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Admit Student to Academy
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
