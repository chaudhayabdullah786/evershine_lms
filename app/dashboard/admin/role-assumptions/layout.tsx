import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Role Assumptions - Admin Workspace',
}

export default function RoleAssumptionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
