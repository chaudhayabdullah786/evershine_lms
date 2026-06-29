'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, XCircle, Search, Calendar, User, MapPin, Loader2, Building2, Phone, AlertCircle, Trash2 } from 'lucide-react'
import { notify } from '@/lib/notify'
import { AccessDenied } from '@/components/AccessDenied'
import { Skeleton } from '@/components/ui/skeleton'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'
import { batchRequiresGenderSeparation, genderSeparationHint } from '@/lib/academic/gender-policy'

interface AdmissionRequest {
  id: string
  firstName: string
  lastName: string
  fatherName: string
  motherName?: string
  cnicBForm: string
  dateOfBirth: string
  placeOfBirth?: string
  gender: string
  bloodGroup?: string
  religion?: string
  nationality: string
  domicile?: string
  address: string
  city: string
  province: string
  postalCode?: string
  phoneNumber: string
  emergencyContact: string
  email?: string

  guardianFirstName?: string
  guardianLastName?: string
  guardianCnic?: string
  guardianPhoneNumber?: string
  guardianEmail?: string
  guardianRelationship?: string
  fatherOccupation?: string
  fatherQualification?: string
  fatherCnic?: string

  requestedLevel: string
  requestedClass?: number
  previousSchool?: string
  lastClassPassed?: number
  lastPercentage?: string
  boardName?: string
  yearOfPassing?: number
  requestedGroupOther?: string
  requestedCourses: string[]
  requestedCoursesOther?: string
  interviewInstitute?: string
  interviewMarksObtained?: number
  interviewPercentage?: string
  interviewYear?: number
  interviewGroup?: string

  passportPhotoUrl?: string
  bFormDocUrl?: string
  previousResultUrl?: string
  medicalConditions?: string
  hasDisability: boolean
  disabilityDetails?: string
  hasSiblingAtAcademy: boolean
  siblingName?: string
  siblingClass?: string

  preferredCampusId?: string
  preferredBatchId?: string
  preferredShift?: string
  preferredClassSectionId?: string
  deliveryMode: string
  
  status: 'PENDING' | 'APPROVED' | 'DECLINED'
  createdAt: string
}

export default function AdmissionsDashboard() {
  const { data: session, status } = useSession()
  const userRole = session?.user?.role as string | undefined
  const canManageAdmissions = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<AdmissionRequest | null>(null)
  const [requestToDelete, setRequestToDelete] = useState<AdmissionRequest | null>(null)
  
  // Assignment State
  const [campusId, setCampusId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [classId, setClassId] = useState('')
  const [section, setSection] = useState('')
  const [houseId, setHouseId] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [admissionFee, setAdmissionFee] = useState(0)
  const [courseFee, setCourseFee] = useState(0)
  const [totalAcademicFee, setTotalAcademicFee] = useState(0)
  const [manualTotalOverride, setManualTotalOverride] = useState(false)
  const [shift, setShift] = useState<'MORNING' | 'EVENING' | 'NIGHT'>('MORNING')
  const [deliveryMode, setDeliveryMode] = useState<'PHYSICAL' | 'ONLINE' | 'HYBRID'>('PHYSICAL')
  const [classSectionId, setClassSectionId] = useState('')

  const queryClient = useQueryClient()

  // Queries
  const { data: reqData, isLoading } = useQuery({
    queryKey: ['admissions', statusFilter],
    queryFn: () => fetchPaginatedApi<AdmissionRequest>(`/api/admissions?status=${statusFilter}&limit=20`),
    enabled: canManageAdmissions,
  })
  
  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchPaginatedApi<any>('/api/campuses'),
    enabled: canManageAdmissions && !!selectedRequest
  })

  const { data: batchesData } = useQuery({
    queryKey: ['batches', campusId],
    queryFn: () => fetchPaginatedApi<any>(`/api/batches?campusId=${campusId}`),
    enabled: canManageAdmissions && !!campusId
  })

  const { data: classesData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes', campusId, batchId],
    queryFn: () =>
      fetchPaginatedApi<any>(
        `/api/classes?campusId=${campusId}&batchId=${batchId}&limit=200`
      ),
    enabled: canManageAdmissions && !!campusId && !!batchId,
  })

  const { data: housesData } = useQuery({
    queryKey: ['houses', batchId],
    queryFn: () => fetchPaginatedApi<any>(`/api/houses?batchId=${batchId}`),
    enabled: canManageAdmissions && !!batchId
  })

  const { data: classSectionsData } = useQuery({
    queryKey: ['class-sections', campusId, batchId],
    queryFn: () => fetchApi<any[]>(`/api/class-sections?campusId=${campusId}&batchId=${batchId}`),
    enabled: !!campusId && !!batchId,
  })

  const requests = reqData?.data ?? []
  const campuses = campusesData?.data ?? []
  const autoAcademicTotal = admissionFee + courseFee

  useEffect(() => {
    if (selectedRequest) {
      setAdmissionFee(0)
      setCourseFee(0)
      setTotalAcademicFee(0)
      setManualTotalOverride(false)
    } else {
      setAdmissionFee(0)
      setCourseFee(0)
      setTotalAcademicFee(0)
      setManualTotalOverride(false)
    }
  }, [selectedRequest])

  useEffect(() => {
    if (!manualTotalOverride) {
      setTotalAcademicFee(admissionFee + courseFee)
    }
  }, [admissionFee, courseFee, manualTotalOverride])

  // Data aggregation from queries
  const batches = batchesData?.data ?? []
  const classesRaw = (classesData as any)?.data ?? (Array.isArray(classesData) ? classesData : [])
  const houses = (housesData as any)?.data ?? (Array.isArray(housesData) ? housesData : [])
  const activeBatch = batches.find((b: any) => b.id === batchId)
  const studentGender = selectedRequest?.gender
  const batchRequiresSeparation = activeBatch ? batchRequiresGenderSeparation(activeBatch.academicLevel, activeBatch.forceGenderSeparation) : false

  const campusOptionDisabled = (campus: any) => {
    if (!batchRequiresSeparation || !studentGender) return false
    return !campus.gender || campus.gender !== studentGender
  }

  const campusSelectionHint = activeBatch
    ? genderSeparationHint(activeBatch, studentGender)
    : 'Select a batch to see whether gender-specific campus placement is required.'

  // Reactive Class Filtering: If a batch is selected, show only relevant classes
  // PROFESSIONAL FILTERING & GROUPING
  let compatibleClasses: any[] = []
  let otherClasses: any[] = []

  if (batchId) {
    const level = activeBatch?.academicLevel
    const batchLabel = (activeBatch?.name + (activeBatch?.code || '')).toLowerCase()
    
    // Determine compatibility
    classesRaw.forEach((c: any) => {
      const isDirectMatch = c.batchId === batchId
      let isGradeMatch = false
      
      if (level === 'Secondary' || batchLabel.includes('matric')) {
        // Matriculation Tier: Grades 9–10
        isGradeMatch = c.grade === 9 || c.grade === 10
      } else if (level === 'HigherSecondary' || batchLabel.includes('inter') || batchLabel.includes('college')) {
        // Intermediate/College Tier: Grades 11–12
        isGradeMatch = c.grade === 11 || c.grade === 12
      } else if (level === 'Middle' || batchLabel.includes('junior') || batchLabel.includes('middle')) {
        // Junior Tier: Grades 6–8
        isGradeMatch = c.grade >= 6 && c.grade <= 8
      } else if (level === 'Elementary' || batchLabel.includes('kids') || batchLabel.includes('primary')) {
        // Kids Tier: Grades 1–5
        isGradeMatch = c.grade >= 1 && c.grade <= 5
      } else if (level === 'PreSchool') {
        isGradeMatch = c.grade === 0
      }

      if (isDirectMatch || isGradeMatch) {
        compatibleClasses.push(c)
      } else {
        otherClasses.push(c)
      }
    })
  } else if (selectedRequest) {
    const req = selectedRequest.requestedLevel.toLowerCase()
    classesRaw.forEach((c: any) => {
      let isMatch = false
      if (req.includes('kids') || req.includes('primary')) isMatch = c.grade >= 1 && c.grade <= 5
      else if (req.includes('junior') || req.includes('middle')) isMatch = c.grade >= 6 && c.grade <= 8
      else if (req.includes('matric') || req.includes('secondary')) isMatch = c.grade === 9 || c.grade === 10
      else if (req.includes('inter') || req.includes('higher') || req.includes('college')) isMatch = c.grade === 11 || c.grade === 12

      if (isMatch) compatibleClasses.push(c)
      else otherClasses.push(c)
    })
  } else {
    compatibleClasses = classesRaw
  }

  // Sort groups
  const sortedCompatible = [...compatibleClasses].sort((a, b) => a.grade - b.grade)
  const sortedOther = [...otherClasses].sort((a, b) => a.grade - b.grade)
  
  // Use compatible classes for the primary list, but we'll show otherClasses as a fallback group
  const classes = sortedCompatible.length > 0 ? sortedCompatible : sortedOther
  const grades = Array.from(new Set(classes.map((c: any) => c.grade))).sort((a, b) => (a as any) - (b as any))
  const hasCompatible = sortedCompatible.length > 0
  
  // Restrictions removed: All campus batches and classes are now visible for the admin to choose


  // Approval Mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      return fetchApi(`/api/admissions/${selectedRequest?.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ 
          campusId, 
          batchId, 
          classId, 
          section,
          houseId,
          rollNumber,
          admissionFee,
          courseFee,
          totalAcademicFee,
          shift,
          deliveryMode,
          classSectionId: classSectionId || undefined,
        })
      })
    },
    onSuccess: () => {
      notify.success('Admission approved and student profile generated!')
      queryClient.invalidateQueries({ queryKey: ['admissions'] })
      setSelectedRequest(null)
      // Reset form
      setCampusId(''); setBatchId(''); setClassId(''); setSection(''); setHouseId(''); setRollNumber(''); setAdmissionFee(0);
      setCourseFee(0); setTotalAcademicFee(0);
      setShift('MORNING'); setDeliveryMode('PHYSICAL'); setClassSectionId('');
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to approve admission')
    }
  })

  const declineMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string, reason: string }) => {
      const res = await fetch(`/api/admissions/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      if (!res.ok) throw new Error('Failed to decline request')
      return res.json()
    },
    onSuccess: () => {
      notify.success('Admission request declined')
      queryClient.invalidateQueries({ queryKey: ['admissions'] })
      setSelectedRequest(null)
    },
    onError: (err: any) => notify.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchApi(`/api/admissions/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      notify.success('Admission request deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['admissions'] })
      setRequestToDelete(null)
    },
    onError: (err: any) => notify.error(err.message || 'Failed to delete request')
  })

  const handleApprove = () => {
    if (!campusId || !batchId || !rollNumber) {
      notify.error('Please assign Campus, Batch, and Roll Number before approving')
      return
    }
    if (admissionFee < 0) {
      notify.error('Admission fee must be zero or a positive number')
      return
    }
    if (courseFee < 0) {
      notify.error('Course fee must be zero or a positive number')
      return
    }
    if (totalAcademicFee < 0) {
      notify.error('Total academic fee must be zero or a positive number')
      return
    }
    if (totalAcademicFee < admissionFee + courseFee) {
      notify.error('Total academic fee must be at least the sum of admission fee and course fee')
      return
    }
    if (houses.length > 0 && !houseId) {
      notify.error('Please assign a Performance House for this batch')
      return
    }
    approveMutation.mutate()
  }

  // Route guard: only SUPER_ADMIN and ADMIN can access admissions management
  if (status === 'loading') return null
  if (!canManageAdmissions) {
    return (
      <AccessDenied
        title="Admissions Access Restricted"
        message="Only administrators can review and approve student admission requests. Teachers and students cannot access this module."
      />
    )
  }

  return (
    <motion.div 
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className="space-y-6 max-w-7xl mx-auto"
    >
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <User className="w-6 h-6" />
            </div>
            Admission Requests
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">Review online applications, map candidates to batches, and generate student profiles.</p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp(0.2)} className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search CNIC or Name..."
                className="pl-9 bg-white border-slate-200"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-white border-slate-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending Review</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative w-full overflow-x-auto min-h-[400px]">
          <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Applicant Name</TableHead>
                  <TableHead>CNIC / B-Form</TableHead>
                  <TableHead>Requested Level</TableHead>
                  <TableHead>Requested Class</TableHead>
                  <TableHead>Applied Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64">
                      <EmptyState 
                        icon={User}
                        title={`No ${statusFilter.toLowerCase()} requests`}
                        description={search ? "Try adjusting your search criteria." : `There are currently no admission requests with the status: ${statusFilter}.`}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-slate-50/80 transition-colors group">
                      <TableCell>
                        <p className="font-medium">{req.firstName} {req.lastName}</p>
                        <p className="text-xs text-gray-500">{req.gender} • {req.phoneNumber}</p>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{req.cnicBForm}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 font-semibold">{req.requestedLevel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 font-semibold">{req.requestedClass ? `Class ${req.requestedClass}` : 'N/A'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          req.status === 'PENDING' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' :
                          req.status === 'APPROVED' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                          'bg-red-100 text-red-700 hover:bg-red-100'
                        }>
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {req.status === 'PENDING' && (
                            <>
                              <Button size="sm" onClick={() => setSelectedRequest(req)} className="gap-2">
                                Review & Assign <CheckCircle className="w-4 h-4" />
                              </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setRequestToDelete(req)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                          )}
                          {req.status === 'APPROVED' && (
                            <Badge variant="secondary" className="bg-green-50 text-green-700">Account Active</Badge>
                          )}
                          {req.status === 'DECLINED' && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-600"
                              onClick={() => setRequestToDelete(req)}
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
        </div>
      </motion.div>

      {/* Approval & Assignment Modal */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review & Assign Candidate</DialogTitle>
            <DialogDescription>
              Review the complete admission application and map the applicant to academic structures.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <Tabs defaultValue="review" className="w-full mt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="review">Application Review</TabsTrigger>
                <TabsTrigger value="assign">Assign & Approve</TabsTrigger>
              </TabsList>

              {/* TAB 1: APPLICATION REVIEW */}
              <TabsContent value="review" className="space-y-6 py-4 outline-none">
                {/* Applicant Summary */}
                <div className="flex gap-4 bg-gray-50 p-4 rounded-lg border items-start">
                  <div className="w-24 h-24 shrink-0 bg-white border rounded-md overflow-hidden flex items-center justify-center">
                    {selectedRequest.passportPhotoUrl ? (
                      <img src={selectedRequest.passportPhotoUrl} alt="Applicant Photo" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-blue-100 text-blue-700 flex items-center justify-center text-3xl font-bold">
                        {selectedRequest.firstName[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-xl text-gray-900">{selectedRequest.firstName} {selectedRequest.lastName}</h3>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm text-gray-600 mt-3">
                      <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-slate-400"/> Gender: <span className="font-medium text-slate-900">{selectedRequest.gender}</span></span>
                      <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400"/> Requested Level: <span className="font-medium text-slate-900">{selectedRequest.requestedLevel}</span></span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400"/> CNIC/B-Form: <span className="font-medium text-slate-900">{selectedRequest.cnicBForm}</span></span>
                      <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-400"/> DOB: <span className="font-medium text-slate-900">{new Date(selectedRequest.dateOfBirth).toLocaleDateString()}</span></span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal & Family */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 border-b pb-1 mb-2">Family Details</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Father</dt><dd className="font-medium text-slate-900">{selectedRequest.fatherName}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Mother</dt><dd className="font-medium text-slate-900">{selectedRequest.motherName || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Father Occ.</dt><dd className="font-medium text-slate-900">{selectedRequest.fatherOccupation || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Father Edu.</dt><dd className="font-medium text-slate-900">{selectedRequest.fatherQualification || 'N/A'}</dd></div>
                      </dl>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 border-b pb-1 mb-2">Contact Info</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{selectedRequest.phoneNumber}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Emergency</dt><dd className="font-medium text-slate-900">{selectedRequest.emergencyContact || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900">{selectedRequest.email || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">City</dt><dd className="font-medium text-slate-900">{selectedRequest.city || 'N/A'}</dd></div>
                      </dl>
                    </div>

                    {selectedRequest.guardianFirstName && (
                      <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-sm">
                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <User className="w-4 h-4"/> Guardian Info
                        </h4>
                        <dl className="space-y-1">
                          <div className="flex justify-between"><dt className="text-blue-700">Name</dt><dd className="font-medium text-slate-900">{selectedRequest.guardianFirstName} {selectedRequest.guardianLastName}</dd></div>
                          <div className="flex justify-between"><dt className="text-blue-700">Relation</dt><dd className="font-medium text-slate-900">{selectedRequest.guardianRelationship}</dd></div>
                          <div className="flex justify-between"><dt className="text-blue-700">CNIC</dt><dd className="font-medium text-slate-900">{selectedRequest.guardianCnic}</dd></div>
                          <div className="flex justify-between"><dt className="text-blue-700">Phone</dt><dd className="font-medium text-slate-900">{selectedRequest.guardianPhoneNumber}</dd></div>
                        </dl>
                      </div>
                    )}
                  </div>

                  {/* Academic & Documents */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 border-b pb-1 mb-2">Previous Academic Record</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">School</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.previousSchool || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Last Class</dt><dd className="font-medium text-slate-900">{selectedRequest.lastClassPassed === 0 ? 'Below Class 1' : selectedRequest.lastClassPassed === 13 ? 'Above Class 12' : selectedRequest.lastClassPassed ? `Class ${selectedRequest.lastClassPassed}` : 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Percentage</dt><dd className="font-medium text-slate-900">{selectedRequest.lastPercentage || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Year</dt><dd className="font-medium text-slate-900">{selectedRequest.yearOfPassing || 'N/A'} {selectedRequest.boardName ? `(${selectedRequest.boardName})` : ''}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Custom Primary Group</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.requestedGroupOther || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Other Course Details</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.requestedCoursesOther || 'N/A'}</dd></div>
                      </dl>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 border-b pb-1 mb-2">Interview Academic Summary</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Institute</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.interviewInstitute || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Group</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.interviewGroup || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Marks Obtained</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.interviewMarksObtained ?? 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">%age</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.interviewPercentage || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Year</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.interviewYear || 'N/A'}</dd></div>
                      </dl>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 border-b pb-1 mb-2">Medical & Additional</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Blood Group</dt><dd className="font-medium text-slate-900">{selectedRequest.bloodGroup || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Medical</dt><dd className="font-medium text-slate-900 text-right">{selectedRequest.medicalConditions || 'None'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Disability</dt><dd className="font-medium text-slate-900">{selectedRequest.hasDisability ? 'Yes' : 'No'}</dd></div>
                        {selectedRequest.hasDisability && selectedRequest.disabilityDetails && (
                          <div className="mt-1 bg-red-50 p-2 rounded border border-red-100 text-red-600 text-xs">
                            <strong>Details:</strong> {selectedRequest.disabilityDetails}
                          </div>
                        )}
                      </dl>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-slate-900 border-b pb-1">Documents Uploaded</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedRequest.bFormDocUrl ? (
                          <a href={selectedRequest.bFormDocUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 p-2 rounded">
                            <CheckCircle className="w-4 h-4 text-emerald-500"/> B-Form / CNIC
                          </a>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 p-2 rounded">
                            <XCircle className="w-4 h-4"/> B-Form / CNIC
                          </div>
                        )}
                        {selectedRequest.previousResultUrl ? (
                          <a href={selectedRequest.previousResultUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 p-2 rounded">
                            <CheckCircle className="w-4 h-4 text-emerald-500"/> Prev. Result
                          </a>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 p-2 rounded">
                            <XCircle className="w-4 h-4"/> Prev. Result
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-slate-200">
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" 
                    onClick={() => {
                      const reason = prompt('Reason for declining this application (Optional):')
                      if (reason !== null) {
                        declineMutation.mutate({ id: selectedRequest.id, reason })
                      }
                    }}
                    disabled={approveMutation.isPending || declineMutation.isPending}
                  >
                    {declineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />} Decline
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={approveMutation.isPending}>Cancel</Button>
                </div>
              </TabsContent>

              {/* TAB 2: ASSIGN AND APPROVE */}
              <TabsContent value="assign" className="space-y-6 py-4 outline-none">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">1. Assign Campus *</Label>
                      <Select value={campusId} onValueChange={(val) => { setCampusId(val); setBatchId(''); setHouseId(''); setClassId('') }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Campus" />
                        </SelectTrigger>
                        <SelectContent>
                          {campuses.map((c: any) => (
                            <SelectItem key={c.id} value={c.id} disabled={campusOptionDisabled(c)}>
                              {c.name}
                              {campusOptionDisabled(c) ? ' — not compatible with selected batch' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-gray-500">{campusSelectionHint}</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">
                        2. Assign Batch *
                      </Label>
                      <Select value={batchId} onValueChange={(val) => { setBatchId(val); setHouseId(''); setClassId('') }} disabled={!campusId}>
                        <SelectTrigger>
                          <SelectValue placeholder={!campusId ? 'Select campus first' : 'Select batch'} />
                        </SelectTrigger>
                        <SelectContent>
                          {batches.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name} <span className="text-gray-400 text-xs ml-1">({b.code})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-gray-500">
                        Showing all batches for the selected campus.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">
                        3. Performance House {houses.length > 0 ? '*' : ''}
                      </Label>
                      <Select value={houseId} onValueChange={setHouseId} disabled={!batchId}>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !batchId
                              ? 'Select batch first'
                              : houses.length === 0
                                ? 'No houses for this batch'
                                : 'Select house (Junoon, Parvaaz…)'
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {houses.length === 0 ? (
                            <SelectItem value="__none" disabled>No performance houses configured</SelectItem>
                          ) : (
                            houses.map((h: { id: string; name: string; color: string }) => (
                              <SelectItem key={h.id} value={h.id}>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color }} />
                                  {h.name}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-gray-500">
                        Houses load automatically when you select a batch.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">4. Assign Class (Optional)</Label>
                      <Select value={classId} onValueChange={setClassId} disabled={!campusId || !batchId || (houses.length > 0 && !houseId)}>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !batchId
                              ? 'Select batch first'
                              : houses.length > 0 && !houseId
                                ? 'Select performance house first'
                                : 'Select class (1–12)'
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {isLoadingClasses ? (
                            <div className="p-2 flex items-center justify-center gap-2 text-xs text-gray-500">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading classes...
                            </div>
                          ) : grades.length > 0 ? (
                            grades.map((grade) => (
                              <SelectGroup key={grade}>
                                <SelectLabel className="text-blue-600 bg-blue-50/50 px-2 py-1 text-[10px] uppercase font-bold tracking-wider">
                                  Grade {grade}
                                </SelectLabel>
                                {classes.filter((c: { grade: number }) => c.grade === grade).map((c: { id: string; name: string; batch?: { name: string } }) => (
                                  <SelectItem key={c.id} value={c.id} className="pl-6">
                                    {c.name} {c.batch?.name ? <span className="text-gray-400 text-[10px] ml-1">({c.batch.name})</span> : ''}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))
                          ) : (
                            <SelectItem value="no-classes" disabled>No classes found for this batch</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className={`text-[10px] ${hasCompatible ? 'text-gray-500' : 'text-amber-600 font-bold italic'}`}>
                        {batchId
                          ? hasCompatible
                            ? `Classes for ${activeBatch?.name ?? 'selected batch'}`
                            : `No classes linked to ${activeBatch?.name} — create them under Classes`
                          : 'Select batch to load classes'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">5. Session Shift *</Label>
                      <Select value={shift} onValueChange={(v) => setShift(v as typeof shift)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MORNING">Morning (09:00–12:00)</SelectItem>
                          <SelectItem value="EVENING">Evening (15:00–18:00)</SelectItem>
                          <SelectItem value="NIGHT">Night (18:00–21:00)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">6. Class Mode *</Label>
                      <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as typeof deliveryMode)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PHYSICAL">Physical (On-campus)</SelectItem>
                          <SelectItem value="ONLINE">Online</SelectItem>
                          <SelectItem value="HYBRID">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>7. Class Section (Academic Engine)</Label>
                    <Select value={classSectionId} onValueChange={setClassSectionId} disabled={!campusId || !batchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Optional — link to formal class section" />
                      </SelectTrigger>
                      <SelectContent>
                        {(classSectionsData ?? []).map((s: { id: string; className: string; sectionName: string; shift?: { name: string }; deliveryMode: string }) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.className}-{s.sectionName} · {s.shift?.name ?? ''} · {s.deliveryMode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-blue-900 font-semibold">8. Roll Number *</Label>
                      <Input placeholder="e.g. 101, 6A-01" value={rollNumber} onChange={e => setRollNumber(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>9. Section (Legacy class)</Label>
                      <Input placeholder="e.g. A, B, Boys-1" value={section} onChange={e => setSection(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Academic fee assignment</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Review and confirm admission, course, and total academic fees before approving the applicant.
                        </p>
                      </div>
                      <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Fee totals are editable
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <Label className="text-slate-900 font-semibold">Admission Processing Fee</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 2000"
                          value={admissionFee}
                          onChange={e => setAdmissionFee(Number(e.target.value) || 0)}
                          min={0}
                          inputMode="numeric"
                          step="1"
                        />
                        <p className="text-xs text-slate-500">
                          One-time admission fee captured at the time of approval.
                        </p>
                      </div>

                      <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <Label className="text-slate-900 font-semibold">Courses & Stream Fee</Label>
                        <Input
                          type="number"
                          min={0}
                          value={courseFee}
                          onChange={(e) => setCourseFee(Number(e.target.value) || 0)}
                          inputMode="numeric"
                          step="1"
                        />
                        <p className="text-xs text-slate-500">
                          Monthly course/stream fee — set by the administration based on the student's enrolled program.
                        </p>
                      </div>

                      <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <Label className="text-slate-900 font-semibold">Total Academic Fee</Label>
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
                            onClick={() => {
                              setTotalAcademicFee(autoAcademicTotal)
                              setManualTotalOverride(false)
                            }}
                          >
                            Reset
                          </button>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          value={totalAcademicFee}
                          onChange={(e) => {
                            setTotalAcademicFee(Number(e.target.value) || 0)
                            setManualTotalOverride(true)
                          }}
                          inputMode="numeric"
                          step="1"
                        />
                        <p className="text-xs text-slate-500">
                          {manualTotalOverride
                            ? 'Manual override enabled. Confirm this amount matches approved academic charges.'
                            : `Auto-calculated from admission + course fee = Rs ${autoAcademicTotal.toLocaleString()}.`}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                        <div className="flex items-center justify-between text-sm text-slate-600 mb-3">
                          <span className="font-semibold text-slate-900">Fee summary</span>
                          {manualTotalOverride ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">Manual override</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Auto-calculated</Badge>
                          )}
                        </div>
                        <div className="space-y-3 text-sm text-slate-700">
                          <div className="flex justify-between">
                            <span>Admission Fee</span>
                            <span className="font-medium">Rs {admissionFee.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Course Fee</span>
                            <span className="font-medium">Rs {courseFee.toLocaleString()}</span>
                          </div>
                          <div className="border-t border-slate-200 pt-3 flex justify-between text-base font-semibold text-slate-900">
                            <span>Total Academic Fee</span>
                            <span>Rs {totalAcademicFee.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">Approval guidance</h3>
                        <p className="text-sm leading-6 text-slate-600">
                          Total academic fee must equal or exceed admission fee + course fee. Use the reset action if the total should reflect the system suggestion.
                        </p>
                        <div className="mt-4 grid gap-2 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                            System-calculated values are the recommended starting point.
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                            Override only for approved extra academic charges.
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            Approved candidates receive a student profile and fee record immediately.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-xs text-amber-800 mt-6">
                  <span className="font-bold">Note:</span> Approving will immediately generate a Student ID (Registration Number) and a User Account. Their default password will be their CNIC without hyphens. Timetables and subjects will automatically map based on the chosen Batch and Class.
                </div>

                <DialogFooter className="mt-6 pt-4 border-t border-gray-100 flex justify-between sm:justify-between items-center w-full">
                  <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={approveMutation.isPending}>Cancel</Button>
                  <Button 
                    onClick={handleApprove} 
                    disabled={approveMutation.isPending || declineMutation.isPending || !campusId || !batchId || !rollNumber || totalAcademicFee === 0}
                    className="bg-green-600 hover:bg-green-700 text-white min-w-[150px]"
                  >
                    {approveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</> : <><CheckCircle className="w-4 h-4 mr-2" /> Approve & Enrol</>}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Modal */}
      <Dialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
            <DialogDescription className="py-2">
              Are you sure you want to delete the admission request for <span className="font-bold text-gray-900">{requestToDelete?.firstName} {requestToDelete?.lastName}</span>? 
              <br /><br />
              This action is permanent and will remove all associated application data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setRequestToDelete(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => requestToDelete && deleteMutation.mutate(requestToDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
