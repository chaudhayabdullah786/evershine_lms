'use client'

/**
 * QRScannerModal
 *
 * WHY native BarcodeDetector over html5-qrcode:
 *   - Zero extra dependency (no npm install needed)
 *   - Browser-native performance (GPU-accelerated in Chromium)
 *   - Works for QR codes AND 1D barcodes (Code128, EAN13) via same API
 *
 * TRADE-OFF:
 *   - BarcodeDetector is Chromium-only (Chrome, Edge, Opera).
 *   - Firefox/Safari fallback: a manual text entry field is shown so attendance
 *     is never blocked, just less automated.
 *
 * USAGE:
 *   <QRScannerModal
 *     open={scanModalOpen}
 *     onClose={() => setScanModalOpen(false)}
 *     onDetected={(code) => markStudentPresent(code)}
 *   />
 */

import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Camera, CameraOff, Scan, AlertTriangle } from 'lucide-react'
import { notify } from '@/lib/notify'

interface Props {
  open: boolean
  onClose: () => void
  /** Called with the raw scanned/typed code (registration no or roll no) */
  onDetected: (code: string) => void
}

declare global {
  interface Window {
    BarcodeDetector: any
  }
}

export default function QRScannerModal({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<any>(null)

  const [supported, setSupported] = useState<boolean | null>(null) // null = checking
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [lastScanned, setLastScanned] = useState('')
  const cooldownRef = useRef(false)

  // ── Check BarcodeDetector support ───────────────────────────────────────────
  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])


  const startCamera = async () => {
    setCameraError(null)
    setScanning(false)
    try {
      // WHY environment (rear) camera: optimised for QR scanning distance
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Init BarcodeDetector
      detectorRef.current = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39'],
      })

      setScanning(true)
      scheduleScan()
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permission in your browser and try again.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device.')
      } else {
        setCameraError(`Camera error: ${err.message}`)
      }
    }
  }

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  const scheduleScan = () => {
    rafRef.current = requestAnimationFrame(doScan)
  }

  const doScan = async () => {
    if (!videoRef.current || !detectorRef.current || !streamRef.current) return
    const video = videoRef.current
    if (video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(doScan)
      return
    }

    try {
      const barcodes = await detectorRef.current.detect(video)
      if (barcodes.length > 0) {
        const raw = barcodes[0].rawValue?.trim()
        if (raw && raw !== lastScanned && !cooldownRef.current) {
          cooldownRef.current = true
          setLastScanned(raw)
          onDetected(raw)
          // Cooldown 2s to prevent duplicate rapid scans
          setTimeout(() => {
            cooldownRef.current = false
            setLastScanned('')
          }, 2000)
        }
      }
    } catch (_) {
      // Ignore individual frame detection errors
    }

    // Continue scanning
    rafRef.current = requestAnimationFrame(doScan)
  }

  // ── Start/stop camera when dialog opens/closes ───────────────────────────────
  useEffect(() => {
    if (open && supported) {
      startCamera()
    }
    return () => {
      stopCamera()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supported])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    onDetected(code)
    setManualCode('')
  }

  const handleClose = () => {
    stopCamera()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Scan className="w-5 h-5 text-indigo-600" />
            Camera QR / Barcode Scanner
          </DialogTitle>
          <DialogDescription className="text-xs">
            Point the camera at a student ID card QR code or barcode to mark them present automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Camera feed */}
        {supported === true && !cameraError && (
          <div className="relative bg-black aspect-video w-full overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Scan target overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 border-2 border-indigo-400 rounded-xl opacity-70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {scanning && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                <Camera className="w-3.5 h-3.5" /> Scanning…
              </div>
            )}
            {lastScanned && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm px-4 py-2 rounded-full font-medium shadow">
                ✓ Detected: {lastScanned}
              </div>
            )}
          </div>
        )}

        {/* BarcodeDetector not supported */}
        {supported === false && (
          <div className="mx-6 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Camera scanning not supported in this browser.</p>
              <p className="mt-1 text-xs text-amber-700">
                This feature requires Google Chrome or Edge. Use the manual entry below instead.
              </p>
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <CameraOff className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">Camera unavailable</p>
              <p className="mt-1 text-xs">{cameraError}</p>
            </div>
          </div>
        )}

        {/* Manual fallback entry */}
        <div className="px-6 pb-6 pt-3 space-y-3">
          <div className="border-t pt-4">
            <Label className="text-xs text-gray-500 uppercase tracking-wide">
              Manual Entry (Registration No / Roll No)
            </Label>
            <form onSubmit={handleManualSubmit} className="flex gap-2 mt-2">
              <Input
                autoFocus={supported === false || !!cameraError}
                placeholder="e.g. ES-2024-001 or scan with scanner gun…"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="text-sm"
              />
              <Button type="submit" disabled={!manualCode.trim()}>Mark</Button>
            </form>
          </div>
          <div className="flex justify-between items-center">
            {scanning && supported && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => { stopCamera(); startCamera() }}
              >
                <Camera className="w-3.5 h-3.5" /> Restart Camera
              </Button>
            )}
            <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={handleClose}>
              Close Scanner
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
