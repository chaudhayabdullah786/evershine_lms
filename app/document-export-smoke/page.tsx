import { notFound } from 'next/navigation'
import { DocumentExportSmokeClient } from './smoke-client'

export default function DocumentExportSmokePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_EXPORT_SMOKE !== 'true') {
    notFound()
  }

  return <DocumentExportSmokeClient />
}
