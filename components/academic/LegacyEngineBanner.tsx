import Link from 'next/link'

type Props = {
  title: string
  message: string
  primaryHref: string
  primaryLabel: string
}

/** Points staff from legacy Class/Timetable/Attendance flows to the academic engine. */
export function LegacyEngineBanner({ title, message, primaryHref, primaryLabel }: Props) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 mb-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-indigo-800">{message}</p>
      <Link href={primaryHref} className="inline-block mt-2 font-medium text-indigo-700 hover:underline">
        {primaryLabel} →
      </Link>
    </div>
  )
}
