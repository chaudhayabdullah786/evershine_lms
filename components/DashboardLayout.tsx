/**
 * @deprecated — This component is superseded by app/dashboard/layout.tsx.
 * The full-featured dashboard shell lives in the App Router layout.
 * This file is retained only to prevent import errors from any
 * overlooked references; it renders nothing.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
