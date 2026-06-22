'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Save, Loader2, User, Phone, MapPin, Building2, Calendar, Droplets, ShieldAlert, Key } from 'lucide-react'
import Link from 'next/link'
import { notify } from '@/lib/notify'

interface StudentEditSource {
  firstName: string
  lastName: string
  fatherName: string
  cnicBForm: string
  dateOfBirth: string
  gender: string
  bloodGroup?: string
  religion?: string
  nationality?: string
  address: string
  city: string
  province: string
  postalCode?: string
  phoneNumber: string
  emergencyContact: string
  email?: string
  rollNumber?: string
  section?: string
  academicYear: string
  profilePicture?: string
  userId: string
}

export default function EditStudentPage() {
  const router = useRouter()
  const { id } = useParams()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<any>(null)

  // Credentials reset local states
  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [isResetting, setIsResetting] = useState(false)

  const { data: studentRaw, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () => fetchApi<StudentEditSource>(`/api/students/${id}`)
  })
  const student = (studentRaw as { data?: StudentEditSource })?.data ?? studentRaw

  useEffect(() => {
    if (student) {
      setFormData({
        firstName: student.firstName,
        lastName: student.lastName,
        fatherName: student.fatherName,
        cnicBForm: student.cnicBForm,
        dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
        gender: student.gender,
        bloodGroup: student.bloodGroup || '',
        religion: student.religion || '',
        nationality: student.nationality || '',
        address: student.address,
        city: student.city,
        province: student.province,
        postalCode: student.postalCode || '',
        phoneNumber: student.phoneNumber,
        emergencyContact: student.emergencyContact,
        email: student.email || '',
        rollNumber: student.rollNumber || '',
        section: student.section || '',
        academicYear: student.academicYear,
      })
      setResetEmail(student.email || '')
    }
  }, [student])

  const updateMutation = useMutation({
    mutationFn: (data: any) => fetchApi(`/api/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      notify.success('Student profile updated successfully')
      queryClient.invalidateQueries({ queryKey: ['student', id] })
      router.push(`/dashboard/students/${id}`)
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to update profile')
    }
  })

  if (isLoading || !formData) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev: any) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [name]: value }))
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
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        setFormData((prev: any) => ({ ...prev, profilePicture: dataUrl }))
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleCredentialsReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      notify.error('Email address cannot be empty')
      return
    }
    if (!confirm('Are you sure you want to update login credentials for this student?')) return

    setIsResetting(true)
    try {
      await fetchApi('/api/users/reset-credentials', {
        method: 'POST',
        body: JSON.stringify({
          userId: student.userId,
          newEmail: resetEmail !== student.email ? resetEmail : undefined,
          newPassword: resetPassword || undefined,
        })
      })
      notify.success('Credentials updated successfully!')
      setResetPassword('')
      queryClient.invalidateQueries({ queryKey: ['student', id] })
    } catch (err: any) {
      notify.error(err.message || 'Failed to reset credentials')
    } finally {
      setIsResetting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/students/${id}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit Student Profile</h1>
            <p className="text-sm text-gray-500">Update academic and personal information for {student.firstName}.</p>
          </div>
        </div>
        <Button 
          type="submit" 
          form="edit-student-form" 
          className="bg-blue-600 hover:bg-blue-700 gap-2"
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <form id="edit-student-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" /> Personal Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Profile Picture Upload */}
              <div className="flex flex-col sm:flex-row items-start gap-4 pb-2 border-b">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden flex items-center justify-center bg-gray-50 flex-shrink-0 relative group">
                  {formData.profilePicture ? (
                    <img src={formData.profilePicture} alt="Preview" className="w-full h-full object-cover" />
                  ) : student.profilePicture ? (
                    <img src={student.profilePicture} alt="Current" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-gray-400">
                      <span className="text-xs">No Image</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                    <span className="text-white text-xs font-bold text-center px-1">Update<br/>Photo</span>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <h3 className="font-medium text-gray-900 text-sm">Profile Picture</h3>
                  <p className="text-[10px] text-gray-500 mt-1 max-w-[200px]">
                    Updating this photo will compress it automatically for ID card compatibility.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input name="firstName" value={formData.firstName} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input name="lastName" value={formData.lastName} onChange={handleChange} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Father's Name</Label>
                <Input name="fatherName" value={formData.fatherName} onChange={handleChange} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={formData.gender} onValueChange={(val) => handleSelectChange('gender', val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CNIC / B-Form</Label>
                  <Input name="cnicBForm" value={formData.cnicBForm} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label>Blood Group</Label>
                  <Select value={formData.bloodGroup} onValueChange={(val) => handleSelectChange('bloodGroup', val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Academic Placement */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" /> Academic Placement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Roll Number</Label>
                <Input name="rollNumber" value={formData.rollNumber} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Input name="section" value={formData.section} onChange={handleChange} placeholder="e.g. A" />
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Input name="academicYear" value={formData.academicYear} onChange={handleChange} placeholder="e.g. 2026-2027" />
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  <span className="font-bold">Note:</span> Changing Campus, Batch, or Class requires a formal transfer process. Contact IT support for administrative structure changes.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact & Address */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" /> Contact & Address
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" name="email" value={formData.email} onChange={handleChange} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Emergency Contact</Label>
                    <Input name="emergencyContact" value={formData.emergencyContact} onChange={handleChange} required />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input name="address" value={formData.address} onChange={handleChange} required />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input name="city" value={formData.city} onChange={handleChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Province</Label>
                    <Input name="province" value={formData.province} onChange={handleChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input name="postalCode" value={formData.postalCode} onChange={handleChange} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
            <CardDescription className="text-xs text-rose-700/80">Change or reset this student's active dashboard login credentials (email & password).</CardDescription>
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
