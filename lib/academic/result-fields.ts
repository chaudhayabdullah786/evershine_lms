export type CustomResultField = {
  label: string
  value: string
}

export function parseCustomResultFields(raw: unknown): CustomResultField[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((field) => {
    if (
      typeof field !== 'object' ||
      field === null ||
      typeof (field as CustomResultField).label !== 'string' ||
      typeof (field as CustomResultField).value !== 'string'
    ) {
      return []
    }

    const label = (field as CustomResultField).label.trim()
    if (!label) return []

    return [{
      label,
      value: (field as CustomResultField).value.trim(),
    }]
  })
}
