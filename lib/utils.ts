import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(d?: string | Date | null) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(d?: string | Date | null) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatCurrency(n?: number | string | null) {
  if (n === null || n === undefined || n === '') return ''
  const num = typeof n === 'number' ? n : parseFloat(String(n))
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(num)
}

export const CLASSES = ['Playgroup','Nursery','KG','1','2','3','4','5','6','7','8','9','10','11','12']
export const SECTIONS = ['A','B','C','D']
export const HOUSES = ['Shaheen','Parvaaz','Junoon','Udraan','Pehchaan']
export const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-']
