'use client'

/**
 * TeacherApplicationModal — Staff recruitment form modal.
 * 
 * Wired to POST /api/staff-applications/apply.
 * Supports TEACHER / ACCOUNTANT / ADMIN_STAFF via applicantType selector.
 * Validates CNIC format (12345-1234567-1), Pakistani phone, and email.
 * Shows field-level errors from both client Zod validation and server responses.
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

const TeacherApplicationSchema = z.object({
  fullName: z.string().min(3, 'Full name required'),
  cnic: z.string().regex(/^[0-9]{5}-[0-9]{7}-[0-9]{1}$/, 'Format: 12345-1234567-1'),
  applicantType: z.enum(['TEACHER', 'ACCOUNTANT', 'ADMIN_STAFF']).default('TEACHER'),
  qualification: z.enum(['BA/BSc', 'MA/MSc', 'MPhil', 'PhD', 'B.Ed', 'M.Ed', 'Other'], { errorMap: () => ({ message: 'Select qualification' }) }),
  specialization: z.string().min(2, 'Enter your teaching subject'),
  experienceYears: z.coerce.number().min(0, 'Enter years of experience').max(50),
  phone: z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Enter valid Pakistani number'),
  email: z.string().email('Enter a valid email address'),
  preferredShift: z.enum(['MORNING', 'EVENING', 'NIGHT'], { errorMap: () => ({ message: 'Select shift preference' }) }).optional(),
  cvLink: z.string().url('Enter valid URL').optional().or(z.literal('')),
})

type FormData = z.infer<typeof TeacherApplicationSchema>

interface Props {
  isOpen: boolean
  onClose: () => void
  whatsappNumber: string
}

export default function TeacherApplicationModal({ isOpen, onClose, whatsappNumber }: Props) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(TeacherApplicationSchema),
    defaultValues: { applicantType: 'TEACHER' },
  })

  const onSubmit = async (data: FormData) => {
    setStatus('submitting')
    setApiError(null)
    try {
      const res = await fetch('/api/staff-applications/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        // Show specific server error (e.g., CNIC cooldown, already employed)
        const msg = json?.error?.message || json?.error || 'Submission failed. Please try again.'
        setApiError(msg)
        setStatus('error')
        return
      }
      setStatus('success')
      reset()
    } catch {
      setApiError('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  const handleClose = () => {
    setStatus('idle')
    setApiError(null)
    reset()
    onClose()
  }

  if (!isOpen) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1.5px solid #E5E7EB',
    fontSize: '0.9rem',
    outline: 'none',
    backgroundColor: '#FAFAFA',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1A1A2E',
    marginBottom: '4px',
  }

  const errorStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    color: '#E8330A',
    marginTop: '2px',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: '16px' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
          <h3 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: '1.25rem', fontWeight: 700, color: '#1B4F8A' }}>Staff Application</h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#6B7280' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '24px' }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <CheckCircle size={56} style={{ color: '#16A34A', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1B4F8A', marginBottom: '8px' }}>Application Submitted!</h4>
              <p style={{ color: '#6B7280', marginBottom: '24px' }}>Our HR team will review your application and contact you within 3-5 working days. A confirmation email has been sent to you.</p>
              <button onClick={handleClose} style={{ padding: '10px 32px', backgroundColor: '#1B4F8A', color: '#FFF', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Close</button>
            </div>
          ) : status === 'error' ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <AlertCircle size={56} style={{ color: '#E8330A', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Submission Failed</h4>
              <p style={{ color: '#6B7280', marginBottom: '16px' }}>{apiError || 'An error occurred.'}</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => { setStatus('idle'); setApiError(null) }} style={{ padding: '10px 24px', backgroundColor: '#1B4F8A', color: '#FFF', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Try Again</button>
                <a href={`https://wa.me/${whatsappNumber}?text=Hello%2C%20I%20want%20to%20apply%20as%20a%20teacher.`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 24px', backgroundColor: '#25D366', color: '#FFF', borderRadius: '10px', textDecoration: 'none', fontWeight: 600 }}>WhatsApp Us</a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: '14px' }}>
              {/* Applicant Type Selector */}
              <div>
                <label style={labelStyle}>Applying For *</label>
                <select {...register('applicantType')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="TEACHER">Teacher</option>
                  <option value="ACCOUNTANT">Accountant</option>
                  <option value="ADMIN_STAFF">Admin Staff</option>
                </select>
                {errors.applicantType && <p style={errorStyle}>{errors.applicantType.message}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input {...register('fullName')} style={inputStyle} placeholder="Your full name" />
                  {errors.fullName && <p style={errorStyle}>{errors.fullName.message}</p>}
                </div>
                <div>
                  <label style={labelStyle}>CNIC *</label>
                  <input {...register('cnic')} style={inputStyle} placeholder="12345-1234567-1" />
                  {errors.cnic && <p style={errorStyle}>{errors.cnic.message}</p>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Qualification *</label>
                  <select {...register('qualification')} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select</option>
                    {['BA/BSc', 'MA/MSc', 'MPhil', 'PhD', 'B.Ed', 'M.Ed', 'Other'].map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                  {errors.qualification && <p style={errorStyle}>{errors.qualification.message}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Specialization *</label>
                  <input {...register('specialization')} style={inputStyle} placeholder="e.g. Mathematics" />
                  {errors.specialization && <p style={errorStyle}>{errors.specialization.message}</p>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Experience (years) *</label>
                  <input type="number" {...register('experienceYears')} style={inputStyle} placeholder="0" min="0" max="50" />
                  {errors.experienceYears && <p style={errorStyle}>{errors.experienceYears.message}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Phone *</label>
                  <input {...register('phone')} style={inputStyle} placeholder="03111234567" />
                  {errors.phone && <p style={errorStyle}>{errors.phone.message}</p>}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" {...register('email')} style={inputStyle} placeholder="your@email.com" />
                {errors.email && <p style={errorStyle}>{errors.email.message}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Preferred Shift</label>
                  <select {...register('preferredShift')} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select (optional)</option>
                    <option value="MORNING">Morning</option>
                    <option value="EVENING">Evening</option>
                    <option value="NIGHT">Night</option>
                  </select>
                  {errors.preferredShift && <p style={errorStyle}>{errors.preferredShift.message}</p>}
                </div>
                <div>
                  <label style={labelStyle}>CV Link (optional)</label>
                  <input {...register('cvLink')} style={inputStyle} placeholder="https://drive.google.com/..." />
                  {errors.cvLink && <p style={errorStyle}>{errors.cvLink.message}</p>}
                </div>
              </div>

              <button type="submit" disabled={status === 'submitting'} style={{ padding: '14px', backgroundColor: '#1B4F8A', color: '#FFF', borderRadius: '10px', border: 'none', fontSize: '1rem', fontWeight: 700, cursor: status === 'submitting' ? 'not-allowed' : 'pointer', opacity: status === 'submitting' ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                {status === 'submitting' && <Loader2 size={18} className="animate-spin" />}
                {status === 'submitting' ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
