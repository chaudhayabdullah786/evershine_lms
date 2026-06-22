'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { notify } from '@/lib/notify'
import { Upload, Loader2, FileText, ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface FeePaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId: string
  invoice: {
    id: string
    challanNumber: string
    month: string
    totalAmount: number
    paidAmount: number
  } | null
}

export function FeePaymentDialog({ open, onOpenChange, studentId, invoice }: FeePaymentDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [remarks, setRemarks] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0]
      if (selected.size > 4 * 1024 * 1024) {
        notify.error('File exceeds maximum size of 4MB')
        e.target.value = ''
        return
      }
      setFile(selected)
    }
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !file) throw new Error('Missing invoice or file')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('remarks', remarks)

      const res = await fetch(`/api/guardian/wards/${studentId}/fees/${invoice.id}/proof`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Failed to upload proof')
      }

      return data
    },
    onSuccess: (data) => {
      notify.success(data.message || 'Payment proof submitted successfully')
      queryClient.invalidateQueries({ queryKey: ['guardian-child-academic', studentId] })
      onOpenChange(false)
      setFile(null)
      setRemarks('')
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to upload proof')
    },
  })

  const remainingAmount = invoice ? Number(invoice.totalAmount) - Number(invoice.paidAmount) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Payment Proof</DialogTitle>
          <DialogDescription>
            Upload a clear image or PDF of your bank deposit slip or online transfer receipt.
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-500">Challan No.</span>
              <span className="font-semibold">{invoice.challanNumber}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-500">Month</span>
              <span className="font-semibold">{invoice.month}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-500">Remaining Due</span>
              <span className="font-bold text-red-600">PKR {remainingAmount.toLocaleString()}</span>
            </div>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); uploadMutation.mutate() }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof-file">Proof Document (JPG, PNG, PDF &lt; 4MB)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="proof-file"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
                className="flex-1"
              />
              {file && (
                <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                  {file.type.includes('pdf') ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks / Transaction Details</Label>
            <Textarea
              id="remarks"
              placeholder="E.g., Transferred via HBL App on [Date], Ref: 123456789"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={uploadMutation.isPending}
              rows={3}
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            disabled={!file || remarks.trim().length < 5 || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Submit Payment Proof
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
