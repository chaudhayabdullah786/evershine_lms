'use client'

/**
 * FAQSection — Accordion FAQ using custom implementation.
 * 
 * Single-open accordion: clicking one collapses the previous.
 * Chevron rotation animation.
 * Keyboard accessible via button elements.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import ScrollReveal from '@/components/landing/scroll-reveal'
import SectionHeading from '@/components/landing/section-heading'
import type { FAQ } from '@/types/landing'

export default function FAQSection({ faqs }: { faqs: FAQ[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section
      id="faq"
      style={{ padding: '80px 0', backgroundColor: '#F9F7F4' }}
    >
      <div className="lp-container">
        <SectionHeading
          title="Frequently Asked Questions"
          subtitle="Answers to the questions parents ask most."
        />

        <ScrollReveal>
          <div style={{ maxWidth: '750px', margin: '0 auto' }}>
            {faqs.map((faq, i) => {
              const isOpen = openIndex === i
              return (
                <div
                  key={i}
                  style={{
                    borderBottom: '1px solid #E5E7EB',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '20px 4px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: '16px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#1B4F8A',
                        lineHeight: 1.4,
                      }}
                    >
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={20}
                      style={{
                        color: '#6B7280',
                        flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </button>

                  <div
                    style={{
                      maxHeight: isOpen ? '200px' : '0px',
                      overflow: 'hidden',
                      transition: 'max-height 0.3s ease, padding 0.3s ease',
                      padding: isOpen ? '0 4px 20px' : '0 4px 0',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '0.9rem',
                        color: '#6B7280',
                        lineHeight: 1.7,
                      }}
                    >
                      {faq.answer}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
