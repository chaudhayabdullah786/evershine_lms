'use client'

/**
 * StudentApplicationModal — Admission form in a modal dialog.
 * 
 * Uses react-hook-form + zod for validation.
 * Pakistani phone regex enforced.
 * For now: validates + shows success state (no API call).
 * API integration added during HOST-02 SMTP migration.
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

const StudentApplicationSchema = z.object({
  fullName: z.string().min(3, 'Full name required (min 3 characters)'),
  fatherName: z.string().min(3, "Father's name required"),
  dateOfBirth: z.string().min(1, 'Date of birth required'),
  classApplying: z.enum([
    'Nursery', 'KG-1', 'KG-2',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8',
    'Grade 9', 'Grade 10',
    'F.Sc Part 1', 'F.Sc Part 2',
    // Quranic programs
    'Hifz-ul-Quran', 'Nazra Quran',
  ], { errorMap: () => ({ message: 'Please select a class' }) }),
  shift: z.enum(['morning', 'evening', 'night'], { errorMap: () => ({ message: 'Please select a shift' }) }),
  deliveryMode: z.enum(['PHYSICAL', 'ONLINE', 'HYBRID']).default('PHYSICAL'),
  phoneNumber: z.string().regex(/(\+92|0)[0-9]{10}$/, 'Enter valid Pakistani number (e.g. 03111234567)'),
  address: z.string().min(10, 'Please enter full address'),
  previousSchool: z.string().optional(),
})

type FormData = z.infer<typeof StudentApplicationSchema>

const CLASS_OPTIONS = [
  'Nursery', 'KG-1', 'KG-2',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8',
  'Grade 9', 'Grade 10',
  'F.Sc Part 1', 'F.Sc Part 2',
  // Quranic programs
  'Hifz-ul-Quran', 'Nazra Quran',
] as const

interface Props {
  isOpen: boolean
  onClose: () => void
  whatsappNumber: string
}

export default function StudentApplicationModal({ isOpen, onClose, whatsappNumber }: Props) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(StudentApplicationSchema),
  })

  const onSubmit = async (data: FormData) => {
    setStatus('submitting')
    try {
      // WHY real API: Landing modal submissions are stored as admission inquiries
      // for follow-up by the admissions team. The /api/admissions/apply endpoint
      // handles validation and persistence.
      const res = await fetch('/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.fullName.split(' ')[0] ?? data.fullName,
          lastName: data.fullName.split(' ').slice(1).join(' ') || 'N/A',
          fatherName: data.fatherName,
          dateOfBirth: data.dateOfBirth,
          requestedClass: data.classApplying,
          preferredShift: data.shift.toUpperCase(),
          deliveryMode: data.deliveryMode,
          phoneNumber: data.phoneNumber,
          address: data.address,
          previousSchool: data.previousSchool || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || 'Submission failed')
      }
      setStatus('success')
      reset()
    } catch (err) {
      console.error('[StudentApplication] Error:', err)
      setStatus('error')
    }
  }

  const handleClose = () => {
    setStatus('idle')
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
    transition: 'border-color 0.2s',
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
          <h3 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: '1.25rem', fontWeight: 700, color: '#1B4F8A' }}>
            Student Application
          </h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#6B7280' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <CheckCircle size={56} style={{ color: '#16A34A', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1B4F8A', marginBottom: '8px' }}>
                Application Submitted!
              </h4>
              <p style={{ color: '#6B7280', marginBottom: '24px' }}>
                We&apos;ll contact you within 24 hours. You can also reach us on WhatsApp.
              </p>
              <button onClick={handleClose} style={{ padding: '10px 32px', backgroundColor: '#1B4F8A', color: '#FFF', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Close
              </button>
            </div>
          ) : status === 'error' ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <AlertCircle size={56} style={{ color: '#E8330A', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1A1A2E', marginBottom: '8px' }}>
                Submission Failed
              </h4>
              <p style={{ color: '#6B7280', marginBottom: '24px' }}>
                Having trouble? Contact us directly on WhatsApp.
              </p>
              <a
                href={`https://wa.me/${whatsappNumber}?text=Hello%20Evershine%20Academy%2C%20I%20want%20to%20apply%20for%20admission.`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', padding: '10px 32px', backgroundColor: '#25D366', color: '#FFF', borderRadius: '10px', textDecoration: 'none', fontWeight: 600 }}
              >
                WhatsApp Us
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input {...register('fullName')} style={inputStyle} placeholder="Student's full name" />
                {errors.fullName && <p style={errorStyle}>{errors.fullName.message}</p>}
              </div>

              <div>
                <label style={labelStyle}>Father&apos;s Name *</label>
                <input {...register('fatherName')} style={inputStyle} placeholder="Father's full name" />
                {errors.fatherName && <p style={errorStyle}>{errors.fatherName.message}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Date of Birth *</label>
                  <input type="date" {...register('dateOfBirth')} style={inputStyle} />
                  {errors.dateOfBirth && <p style={errorStyle}>{errors.dateOfBirth.message}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Class Applying For *</label>
                  <select {...register('classApplying')} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select class</option>
                    {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.classApplying && <p style={errorStyle}>{errors.classApplying.message}</p>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Shift *</label>
                  <select {...register('shift')} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select shift</option>
                    <option value="morning">Morning (9am–12pm)</option>
                    <option value="evening">Evening (3pm–6pm)</option>
                    <option value="night">Night (6pm–9pm)</option>
                  </select>
                  {errors.shift && <p style={errorStyle}>{errors.shift.message}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Phone Number *</label>
                  <input {...register('phoneNumber')} style={inputStyle} placeholder="03111234567" />
                  {errors.phoneNumber && <p style={errorStyle}>{errors.phoneNumber.message}</p>}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Address *</label>
                <textarea {...register('address')} style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} placeholder="Full residential address" />
                {errors.address && <p style={errorStyle}>{errors.address.message}</p>}
              </div>

              <div>
                <label style={labelStyle}>Preferred Delivery Mode</label>
                <select {...register('deliveryMode')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="PHYSICAL">🏫 On-Campus (Physical)</option>
                  <option value="ONLINE">💻 Online</option>
                  <option value="HYBRID">🔄 Hybrid</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Previous School (optional)</label>
                <input {...register('previousSchool')} style={inputStyle} placeholder="Name of previous school" />
              </div>

              <button
                type="submit"
                disabled={status === 'submitting'}
                style={{
                  padding: '14px',
                  backgroundColor: '#E8330A',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
                  opacity: status === 'submitting' ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
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
