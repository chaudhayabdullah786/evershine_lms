'use client'

/**
 * ContactSection — Contact info + inquiry form + Google Maps.
 * 
 * Two-column: Left = contact cards + map, Right = inquiry form.
 * Form validated with zod for basic contact submission.
 */

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MapPin, Phone, Mail, MessageCircle, CheckCircle, Loader2 } from 'lucide-react'
import ScrollReveal from '@/components/landing/scroll-reveal'
import SectionHeading from '@/components/landing/section-heading'
import type { ContactInfo } from '@/types/landing'

const ContactFormSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Enter valid phone number'),
  email: z.string().email('Enter valid email').optional().or(z.literal('')),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

type FormData = z.infer<typeof ContactFormSchema>

export default function ContactSection({ contactInfo }: { contactInfo: ContactInfo }) {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(ContactFormSchema),
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const onSubmit = async (data: FormData) => {
    setStatus('submitting')
    setApiError(null)
    try {
      const res = await fetch('/api/landing/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setApiError(json?.error?.message || 'Failed to send message. Please try again.')
        setStatus('error')
        setTimeout(() => setStatus('idle'), 5000)
        return
      }
      setStatus('success')
      reset()
      setTimeout(() => setStatus('idle'), 4000)
    } catch (_err) {
      setApiError('Network error. Please check your connection and try again.')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  const contactCards = [
    { icon: MapPin, label: 'Address', value: contactInfo.address },
    { icon: Phone, label: 'Phone', value: contactInfo.phone, href: `tel:${contactInfo.phone.replace(/-/g, '')}` },
    { icon: Mail, label: 'Email', value: contactInfo.email, href: `mailto:${contactInfo.email}` },
    { icon: MessageCircle, label: 'WhatsApp', value: 'Chat with us', href: `https://wa.me/${contactInfo.whatsapp}` },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '6px',
    border: '1.5px solid #E5E7EB',
    fontSize: '0.9rem',
    outline: 'none',
    backgroundColor: '#FAFAFA',
  }

  return (
    <section id="contact" style={{ padding: '80px 0', backgroundColor: '#FFFFFF' }}>
      <div className="lp-container">
        <SectionHeading
          title="Get in Touch"
          subtitle="Visit us, call us, or send us a message. We're here to help."
        />

        <ScrollReveal>
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-[1100px] mx-auto"
          >
            {/* Left Column — Contact Info + Map */}
            <div>
              <div style={{ display: 'grid', gap: '16px', marginBottom: '32px' }}>
                {contactCards.map((card) => (
                  <a
                    key={card.label}
                    href={card.href || '#'}
                    target={card.href?.startsWith('http') ? '_blank' : undefined}
                    rel={card.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px 20px',
                      borderRadius: '10px',
                      backgroundColor: '#F9F7F4',
                      textDecoration: 'none',
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 12px rgba(27, 79, 138, 0.08)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)' }}
                  >
                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(27,79,138,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <card.icon size={20} style={{ color: '#1B4F8A' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</p>
                      <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#1A1A2E' }}>{card.value}</p>
                    </div>
                  </a>
                ))}
              </div>

              {/* Google Maps */}
              <div style={{ borderRadius: '16px', overflow: 'hidden', height: '220px', boxShadow: '0 2px 12px rgba(27, 79, 138, 0.08)' }}>
                <iframe
                  src={contactInfo.mapsEmbedUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Evershine Academy Location"
                />
              </div>
            </div>

            {/* Right Column — Contact Form */}
            <div
              style={{
                backgroundColor: '#F9F7F4',
                borderRadius: '16px',
                padding: '32px',
                boxShadow: '0 2px 12px rgba(27, 79, 138, 0.08)',
              }}
            >
              <h3 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: '1.25rem', fontWeight: 700, color: '#1B4F8A', marginBottom: '24px' }}>
                Send us a Message
              </h3>

              {status === 'success' ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <CheckCircle size={48} style={{ color: '#16A34A', marginBottom: '12px' }} />
                  <p style={{ fontWeight: 600, color: '#1B4F8A' }}>Message sent! We&apos;ll get back to you soon.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: '16px' }}>
                  {apiError && (
                    <div style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
                      <p style={{ fontSize: '0.85rem', color: '#991B1B', margin: 0 }}>{apiError}</p>
                    </div>
                  )}
                  <div>
                    <input {...register('name')} style={inputStyle} placeholder="Your Name *" />
                    {errors.name && <p style={{ fontSize: '0.78rem', color: '#E8330A', marginTop: '2px' }}>{errors.name.message}</p>}
                  </div>
                  <div>
                    <input {...register('phone')} style={inputStyle} placeholder="Phone Number *" />
                    {errors.phone && <p style={{ fontSize: '0.78rem', color: '#E8330A', marginTop: '2px' }}>{errors.phone.message}</p>}
                  </div>
                  <div>
                    <input {...register('email')} style={inputStyle} placeholder="Email (optional)" />
                    {errors.email && <p style={{ fontSize: '0.78rem', color: '#E8330A', marginTop: '2px' }}>{errors.email.message}</p>}
                  </div>
                  <div>
                    <textarea {...register('message')} style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} placeholder="Your Message *" />
                    {errors.message && <p style={{ fontSize: '0.78rem', color: '#E8330A', marginTop: '2px' }}>{errors.message.message}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    style={{
                      padding: '14px',
                      backgroundColor: '#1B4F8A',
                      color: '#FFF',
                      borderRadius: '10px',
                      border: 'none',
                      fontSize: '1rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {status === 'submitting' && <Loader2 size={18} className="animate-spin" />}
                    {status === 'submitting' ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
