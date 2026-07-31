import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Apply Online',
  description: 'Apply online for admission to Evershine Academy. Fill out the application form with personal details, academic history, and upload required documents.',
  alternates: {
    canonical: 'https://www.evershineacadmey.com/admissions/apply',
  },
}

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
