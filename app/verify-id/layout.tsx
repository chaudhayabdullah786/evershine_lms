import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Student ID Verification',
  robots: {
    index: false,
    follow: false,
  },
}

export default function VerifyIDLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
