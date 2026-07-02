'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notify } from '@/lib/notify'
import { FileText, ImageIcon, Upload, Loader2 } from 'lucide-react'

export interface FeeInvoiceSummary {
  id: string
  challanNumber: string
  month: string
  totalAmount: number | string
  paidAmount: number | string
}

type ProofUploadStrategy = 'direct' | 'signed'

interface UploadSignatureResponse {
  timestamp: number
  signature: string
  cloudName: string
  apiKey: string
  folder: string
}

interface PaymentProofUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: FeeInvoiceSummary | null
  uploadEndpoint: string
  uploadStrategy?: ProofUploadStrategy
  successMessage?: string
  successQueryKeys?: Array<string[]>
  maxFileSize?: number
}

export function PaymentProofUploadModal({
  open,
  onOpenChange,
  invoice,
  uploadEndpoint,
  uploadStrategy = 'direct',
  successMessage = 'Payment proof submitted successfully!',
  successQueryKeys = [],
  maxFileSize = 4 * 1024 * 1024,
}: PaymentProofUploadModalProps) {
  const queryClient = useQueryClient()
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofRemarks, setProofRemarks] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  if (!invoice) return null

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setProofFile(null)
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      notify.error('Only JPG, PNG, or PDF files are accepted')
      event.target.value = ''
      setProofFile(null)
      return
    }

    if (file.size > maxFileSize) {
      notify.error(`File must be smaller than ${Math.round(maxFileSize / 1024 / 1024)}MB`)
      event.target.value = ''
      setProofFile(null)
      return
    }

    setProofFile(file)
  }

  const resetForm = () => {
    setProofFile(null)
    setProofRemarks('')
  }

  const invalidateSuccessQueries = () => {
    successQueryKeys.forEach((queryKey) => {
      if (queryKey.length) {
        queryClient.invalidateQueries({ queryKey })
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!proofFile) {
      notify.error('Please select a payment proof document')
      return
    }

    if (!proofRemarks.trim()) {
      notify.error('Please provide a brief remark about the transaction')
      return
    }

    if (!uploadEndpoint) {
      notify.error('Upload endpoint is not configured')
      return
    }

    setIsUploading(true)
    try {
      if (uploadStrategy === 'signed') {
        const sigRes = await fetchApi<UploadSignatureResponse>('/api/upload?folder=challans')
        if (!sigRes.cloudName || !sigRes.signature) {
          throw new Error('Upload signature is invalid')
        }

        const cloudinaryForm = new FormData()
        cloudinaryForm.append('file', proofFile)
        cloudinaryForm.append('api_key', sigRes.apiKey)
        cloudinaryForm.append('timestamp', sigRes.timestamp.toString())
        cloudinaryForm.append('signature', sigRes.signature)
        cloudinaryForm.append('folder', sigRes.folder)

        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sigRes.cloudName}/image/upload`, {
          method: 'POST',
          body: cloudinaryForm,
        })

        const uploadJson = await uploadRes.json().catch(() => null)
        if (!uploadRes.ok || !uploadJson?.secure_url) {
          const message = uploadJson?.error?.message || uploadJson?.message || 'Cloudinary upload failed'
          throw new Error(message)
        }

        await fetchApi(uploadEndpoint, {
          method: 'POST',
          body: JSON.stringify({
            proofUrl: uploadJson.secure_url,
            proofRemarks: proofRemarks.trim(),
          }),
        })
      } else {
        const formData = new FormData()
        formData.append('file', proofFile)
        formData.append('remarks', proofRemarks.trim())

        const response = await fetch(uploadEndpoint, {
          method: 'POST',
          body: formData,
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error?.message || payload?.message || 'Upload failed')
        }
      }

      notify.success(successMessage)
      resetForm()
      invalidateSuccessQueries()
      onOpenChange(false)
    } catch (error: any) {
      notify.error(error?.message || 'Failed to submit payment proof')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Upload Payment Receipt
          </DialogTitle>
          <DialogDescription>
            Submit your bank deposit slip or screenshot for verification.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 mb-4">
          <div className="flex justify-between items-center gap-3">
            <div>
              <p className="text-xs text-slate-500">Challan</p>
              <p className="font-semibold text-slate-900">{invoice.challanNumber}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Month</p>
              <p className="font-semibold text-slate-900">{invoice.month}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700">
            <div className="rounded-2xl bg-white p-3 border border-slate-200">
              <p className="text-xs text-slate-500">Remaining Due</p>
              <p className="font-semibold text-red-600">Rs {remaining.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-white p-3 border border-slate-200">
              <p className="text-xs text-slate-500">Attachment</p>
              <p className="font-semibold text-slate-900">JPG, PNG, PDF</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof-file">Proof Document</Label>
            <div className="flex items-center gap-3">
              <Input
                id="proof-file"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={handleFileChange}
                disabled={isUploading}
                className="flex-1"
              />
              {proofFile && (
                <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                  {proofFile.type === 'application/pdf' ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {(proofFile.size / 1024 / 1024).toFixed(1)} MB
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">Max file size {Math.round(maxFileSize / 1024 / 1024)}MB.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks / Transaction ID</Label>
            <Textarea
              id="remarks"
              placeholder="Enter bank transfer details or deposit slip notes"
              value={proofRemarks}
              onChange={(event) => setProofRemarks(event.target.value)}
              disabled={isUploading}
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false) }} disabled={isUploading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isUploading || !proofFile || !proofRemarks.trim()}>
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Submit Receipt'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
