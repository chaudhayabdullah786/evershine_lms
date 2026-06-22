'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { fetchApi } from '@/lib/api-client'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'
import { CampusBatchHouseFields } from '@/components/academic/CampusBatchHouseFields'
import { isPlacementScopeReady, performanceHouseRequired } from '@/lib/academic/hierarchy'
import { STAFF_DESIGNATIONS, isTeachingDesignation, isNonTeachingDesignation } from '@/lib/constants/staff-designations'

const teacherSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').trim(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').trim(),
  cnic: z.string()
    .min(1, 'CNIC is required')
    .transform(v => v.trim().replace(/[-\s]/g, ''))
    .refine(v => /^\d{13}$/.test(v), 'CNIC must be 13 digits'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE'], { required_error: 'Gender is required' }),
  qualification: z.string().min(2, 'Qualification must be at least 2 characters').trim(),
  specialization: z.string().optional(),
  experienceYears: z.coerce.number().int().min(0).default(0),
  joiningDate: z.string().min(1, 'Joining date is required'),
  phoneNumber: z.string().regex(/^\+?[\d\s\-]{10,15}$/, 'Invalid phone number format (e.g. +923001234567)').trim(),
  email: z.string().email('Invalid email address').trim(),
  address: z.string().min(5, 'Address must be at least 5 characters').trim(),
  city: z.string().min(2, 'City must be at least 2 characters').trim(),
  emergencyContact: z.string().regex(/^\+?[\d\s\-]{10,15}$/, 'Invalid emergency contact phone number format').trim(),
  campusId: z.string().min(1, 'Campus selection is required'),
  // WHY optional: Non-teaching staff (sweeper, security guard) are not assigned to academic batches
  batchId: z.string().optional().or(z.literal('')),
  houseId: z.string().optional().or(z.literal('')),
  designation: z.string().min(2, 'Designation is required'),
  customDesignation: z.string().optional(),
  monthlySalary: z.union([z.coerce.number().min(0), z.nan(), z.string().max(0)]).optional().transform(val => (typeof val === 'number' && !isNaN(val)) ? val : undefined),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  profilePicture: z.string().optional(),
})

type TeacherForm = z.infer<typeof teacherSchema>

export default function NewTeacherPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<TeacherForm>({
    resolver: zodResolver(teacherSchema),
    defaultValues: {
      experienceYears: 0,
      designation: 'Teacher',
      gender: undefined,
      campusId: '',
      batchId: '',
      houseId: '',
      profilePicture: '',
      customDesignation: '',
    }
  })

  const selectedCampusId = watch('campusId')
  const selectedBatchId = watch('batchId')
  const selectedDesignation = watch('designation')
  const showTeachingFields = isTeachingDesignation(selectedDesignation)
  const isNonTeaching = isNonTeachingDesignation(selectedDesignation)

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
        const MAX_WIDTH = 400
        const MAX_HEIGHT = 400
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        
        // Compress to JPEG with 0.7 quality to guarantee html2canvas cross-origin support and fast DB storage
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        setPreviewImage(dataUrl)
        setValue('profilePicture', dataUrl)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchApi<any[]>('/api/campuses'),
  })
  const campuses = Array.isArray(campusesData) ? campusesData : []

  const { data: batchesData, isLoading: isLoadingBatches } = useQuery({
    queryKey: ['batches', selectedCampusId],
    queryFn: () => fetchApi<any[]>(`/api/batches?campusId=${selectedCampusId}`),
    enabled: !!selectedCampusId,
  })
  const batches = Array.isArray(batchesData) ? batchesData : []

  const { data: classesData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes', selectedCampusId, selectedBatchId],
    queryFn: () =>
      fetchApi<any[]>(
        `/api/classes?campusId=${selectedCampusId}&batchId=${selectedBatchId}&limit=200`
      ),
    enabled: !!selectedCampusId && !!selectedBatchId && showTeachingFields,
  })
  const classes = classesData ?? []

  const { data: housesData, isLoading: isLoadingHouses } = useQuery({
    queryKey: ['houses', selectedBatchId],
    queryFn: () => fetchApi<any[]>(`/api/houses?batchId=${selectedBatchId}`),
    enabled: !!selectedBatchId,
  })
  const houses = housesData ?? []
  const selectedHouseId = watch('houseId') ?? ''
  const placementReady = isNonTeaching || isPlacementScopeReady(
    selectedCampusId,
    selectedBatchId,
    selectedHouseId,
    houses.length > 0
  )
  const houseRequired = !isNonTeaching && performanceHouseRequired(houses.length > 0)

  const [selectedClasses, setSelectedClasses] = useState<{ classId: string; isClassTeacher: boolean }[]>([])

  // Categorize classes by grade into Tiers: Kids, Junior, Matric, Intermediate
  const categorizedClasses = {
    kids: classes.filter((c: any) => c.grade >= 1 && c.grade <= 5),
    junior: classes.filter((c: any) => c.grade >= 6 && c.grade <= 8),
    matric: classes.filter((c: any) => c.grade === 9 || c.grade === 10),
    intermediate: classes.filter((c: any) => c.grade === 11 || c.grade === 12),
  }

  const onSubmit = async (data: TeacherForm) => {
    // Non-teaching staff only need campus; teaching staff need campus + batch
    if (!isNonTeachingDesignation(data.designation)) {
      if (!isPlacementScopeReady(data.campusId, data.batchId ?? '', data.houseId ?? '', houses.length > 0)) {
        notify.error(
          houseRequired
            ? 'Select campus, batch, and performance house'
            : 'Select campus and batch'
        )
        return
      }
    }
    setIsLoading(true)
    try {
      const formatToIsoNoMs = (dStr: string) => {
        if (!dStr) return undefined
        const d = new Date(dStr)
        if (isNaN(d.getTime())) return undefined
        return d.toISOString().split('.')[0] + 'Z'
      }

      const payload = {
        ...data,
        dateOfBirth: formatToIsoNoMs(data.dateOfBirth),
        joiningDate: formatToIsoNoMs(data.joiningDate),
        classAssignments: showTeachingFields ? selectedClasses : [],
      }
      await fetchApi('/api/teachers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      notify.success('Staff member added successfully!')
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      router.push('/dashboard/teachers')
    } catch (err: any) {
      notify.error('Failed to add staff member', { description: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  const onInvalid = (errors: any) => {
    console.error('Validation errors:', errors)
    const errorList = Object.keys(errors)
      .map(key => `${errors[key].message || 'Invalid value'}`)
      .join(', ')
    notify.error('Required Fields Missing', {
      description: `Please fill all required fields correctly: ${errorList}`,
    })
  }

  const field = (name: keyof TeacherForm) => ({
    ...register(name, name === 'experienceYears' || name === 'monthlySalary' ? { valueAsNumber: true } : undefined),
    className: (errors[name] ? 'border-destructive ' : '') + '',
  })

  const err = (name: keyof TeacherForm) =>
    errors[name] && <p className="text-xs text-destructive mt-1">{String(errors[name]?.message)}</p>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/teachers">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add Staff Member</h1>
          <p className="text-sm text-gray-500">Enrol a new staff member into the system.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        {/* Personal */}
        <Card>
          <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Profile Picture Upload */}
            <div className="flex flex-col sm:flex-row items-start gap-6 md:col-span-2 pb-4 border-b border-gray-100">
              <div className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden flex items-center justify-center bg-gray-50 flex-shrink-0 relative group shadow-sm transition-all hover:border-blue-500">
                {previewImage ? (
                  <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center text-gray-400 p-2">
                    <span className="text-[10px] font-bold block uppercase tracking-wider text-gray-400">Passport Size</span>
                    <span className="text-[8px] block mt-0.5">Photo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-bold">Upload</span>
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <div className="flex flex-col justify-center h-28">
                <h3 className="font-bold text-sm text-gray-900">Staff Profile Picture</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Upload an optional clear, passport-sized photo. It will be automatically optimized and rendered on the staff member's profile card and portal page.
                </p>
                {errors.profilePicture && <p className="text-xs text-destructive mt-2 font-semibold">{errors.profilePicture.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input {...field('firstName')} />{err('firstName')}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input {...field('lastName')} />{err('lastName')}
            </div>
            <div className="space-y-1.5">
              <Label>CNIC (13 digits, no dashes)</Label>
              <Input {...field('cnic')} placeholder="3420012345678" />{err('cnic')}
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" {...field('dateOfBirth')} />{err('dateOfBirth')}
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <input type="hidden" {...register('gender')} />
              <Select onValueChange={(v) => setValue('gender', v as 'MALE' | 'FEMALE', { shouldValidate: true })}>
                <SelectTrigger className={errors.gender ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                </SelectContent>
              </Select>
              {err('gender')}
            </div>
            <div className="space-y-1.5">
              <Label>Joining Date</Label>
              <Input type="date" {...field('joiningDate')} />{err('joiningDate')}
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader><CardTitle>Contact & Address</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Address</Label>
              <Input {...field('address')} />{err('address')}
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input {...field('city')} />{err('city')}
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input {...field('phoneNumber')} placeholder="+92..." />{err('phoneNumber')}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...field('email')} />{err('email')}
            </div>
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input {...field('emergencyContact')} placeholder="+92..." />{err('emergencyContact')}
            </div>
          </CardContent>
        </Card>

        {/* Professional */}
        <Card>
          <CardHeader><CardTitle>Professional Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Qualification</Label>
              <Input {...field('qualification')} placeholder="M.Ed, B.Sc, Matric, etc." />{err('qualification')}
            </div>
            {/* Specialization: only relevant for teaching designations */}
            {showTeachingFields && (
              <div className="space-y-1.5">
                <Label>Specialization</Label>
                <Input {...field('specialization')} placeholder="Mathematics, Physics..." />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <input type="hidden" {...register('designation')} />
              <Select
                onValueChange={(v) => {
                  setValue('designation', v, { shouldValidate: true })
                  // Clear class selections when switching to non-teaching
                  if (!isTeachingDesignation(v)) {
                    setSelectedClasses([])
                  }
                }}
                defaultValue="Teacher"
              >
                <SelectTrigger className={errors.designation ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Custom designation input for "Other" */}
            {selectedDesignation === 'Other' && (
              <div className="space-y-1.5">
                <Label>Custom Designation</Label>
                <Input {...field('customDesignation')} placeholder="e.g. Lab Assistant, Peon, Driver..." />
                {err('customDesignation')}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Years of Experience</Label>
              <Input type="number" min={0} {...field('experienceYears')} />{err('experienceYears')}
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Salary (Rs) — optional</Label>
              <Input type="number" min={0} {...register('monthlySalary', { valueAsNumber: true })} />
            </div>
          </CardContent>
        </Card>

        {/* Placement */}
        <Card>
          <CardHeader><CardTitle>Campus Placement {showTeachingFields ? '& Class Assignment' : ''}</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <input type="hidden" {...register('campusId')} />
            <input type="hidden" {...register('batchId')} />
            <input type="hidden" {...register('houseId')} />

            {isNonTeaching && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 font-medium">
                Support staff only require campus assignment. Batch, house, and class assignments are not applicable.
              </div>
            )}

            <CampusBatchHouseFields
              campusId={selectedCampusId}
              batchId={selectedBatchId}
              houseId={selectedHouseId}
              campuses={campuses}
              batches={isNonTeaching ? [] : batches}
              houses={isNonTeaching ? [] : houses}
              isLoadingBatches={isNonTeaching ? false : isLoadingBatches}
              isLoadingHouses={isNonTeaching ? false : isLoadingHouses}
              campusError={errors.campusId?.message}
              batchError={isNonTeaching ? undefined : errors.batchId?.message}
              houseError={
                houseRequired && selectedBatchId && !selectedHouseId
                  ? 'Performance house is required for this batch'
                  : undefined
              }
              onCampusChange={(v) => {
                setValue('campusId', v, { shouldValidate: true })
                setValue('batchId', '', { shouldValidate: true })
                setValue('houseId', '', { shouldValidate: true })
                setSelectedClasses([])
              }}
              onBatchChange={(v) => {
                setValue('batchId', v, { shouldValidate: true })
                setValue('houseId', '', { shouldValidate: true })
                setSelectedClasses([])
              }}
              onHouseChange={(v) => setValue('houseId', v, { shouldValidate: true })}
            />

            {/* Available Classes checklist grouped by academic tiers — only for teaching staff */}
            {showTeachingFields && placementReady && (
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-gray-900">Assign Classes & Performance Sections</h3>
                  <span className="text-xs text-gray-400">Select classes this staff member will teach</span>
                </div>

                {isLoadingClasses ? (
                  <p className="text-xs text-gray-400 animate-pulse">Fetching available classes...</p>
                ) : classes.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    No classes found for this campus{selectedBatchId ? ' and batch' : ''}. Create classes under Classes first (Morning and Evening are separate entries).
                  </p>
                ) : (
                  <div className="space-y-6">
                    {[
                      { key: 'kids', label: '🧸 Kids Tier (Grades 1-5)', items: categorizedClasses.kids },
                      { key: 'junior', label: '📚 Junior Tier (Grades 6-8)', items: categorizedClasses.junior },
                      { key: 'matric', label: '🎓 Matric Tier (Grades 9-10)', items: categorizedClasses.matric },
                      { key: 'intermediate', label: '🏫 Intermediate Tier (Grades 11-12)', items: categorizedClasses.intermediate },
                    ].map(tier => {
                      if (tier.items.length === 0) return null;

                      return (
                        <div key={tier.key} className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-50/50 py-1.5 px-3 rounded-md">
                            {tier.label}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2">
                            {tier.items.map((cls: any) => {
                              const isChecked = selectedClasses.some(c => c.classId === cls.id)
                              const classAssignment = selectedClasses.find(c => c.classId === cls.id)

                              return (
                                <div 
                                  key={cls.id} 
                                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                    isChecked ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 hover:border-gray-300 bg-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedClasses(prev => [...prev, { classId: cls.id, isClassTeacher: false }])
                                        } else {
                                          setSelectedClasses(prev => prev.filter(c => c.classId !== cls.id))
                                        }
                                      }}
                                      className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4 cursor-pointer"
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-gray-900">{cls.name}</span>
                                      <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                                        Section: {cls.section || 'N/A'} • Grade: {cls.grade}
                                      </span>
                                    </div>
                                  </div>

                                  {isChecked && (
                                    <div className="flex items-center gap-1.5 bg-white border shadow-sm rounded-lg py-1 px-2.5">
                                      <input
                                        type="checkbox"
                                        checked={classAssignment?.isClassTeacher || false}
                                        onChange={(e) => {
                                          setSelectedClasses(prev => prev.map(c => 
                                            c.classId === cls.id ? { ...c, isClassTeacher: e.target.checked } : c
                                          ))
                                        }}
                                        id={`incharge-${cls.id}`}
                                        className="rounded text-green-600 focus:ring-green-500 border-gray-300 w-3.5 h-3.5 cursor-pointer"
                                      />
                                      <label htmlFor={`incharge-${cls.id}`} className="text-[10px] font-bold text-gray-700 cursor-pointer select-none">
                                        Class Incharge
                                      </label>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader><CardTitle>Login Account</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <p className="text-sm text-gray-500">
                The email entered above will be used as the login email. Set a temporary password that the staff member must change on first login.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input type="password" {...field('password')} placeholder="Min 8 characters" />{err('password')}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-10">
          <Button type="submit" disabled={isLoading} className="w-full sm:w-auto px-8">
            {isLoading ? 'Adding Staff Member...' : 'Add Staff Member'}
          </Button>
        </div>
      </form>
    </div>
  )
}
