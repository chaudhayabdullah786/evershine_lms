/** Letter grade from percentage (academic engine — matches report cards). */
export function mapGradeLetter(percentage: number): string {
  if (percentage >= 85) return 'A+'
  if (percentage >= 75) return 'A'
  if (percentage >= 65) return 'B'
  if (percentage >= 50) return 'C'
  if (percentage >= 33) return 'D'
  return 'F'
}
