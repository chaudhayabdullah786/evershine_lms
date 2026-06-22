import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Permission Overrides - Admin Workspace',
}

export default function PermissionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
