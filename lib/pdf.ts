/**
 * Client-side PDF Generation Utility
 *
 * Uses html2canvas to capture a DOM node (like a fee challan or result card)
 * and jsPDF to convert it into a PDF file.
 *
 * WHY client-side: Generating PDFs on the server using Puppeteer requires
 * massive memory overhead and frequently hits Vercel's serverless limits.
 * By rendering the card in the browser and capturing it, we offload the
 * CPU work to the client device.
 */

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  generateBirthdayCertificateDirect,
  generateIDCardDirect,
  generateBonafideCertificateDirect,
  generateResultCardDirect,
  generatePerformanceCardDirect,
  generateReportDirect,
  generateTeacherProfileDirect,
  generateTeacherIDCardDirect,
  generateExperienceLetterDirect,
  type TeacherIDCardData,
  type ExperienceLetterData,
} from './pdf/direct-generators'

async function toDataUrl(source?: string): Promise<string | undefined> {
  if (!source) return undefined
  if (/^data:/i.test(source)) return source

  try {
    const response = await fetch(source, { mode: 'cors' })
      if (!response.ok) {
        return undefined
      }
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        resolve(reader.result as string)
      }
      reader.onerror = () => reject(new Error('Failed to convert image blob to data URL'))
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    return undefined
  }
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve()
  return new Promise((resolve) => {
    const cleanup = () => {
      image.removeEventListener('load', cleanup)
      image.removeEventListener('error', cleanup)
      resolve()
    }
    image.addEventListener('load', cleanup)
    image.addEventListener('error', cleanup)
  })
}

async function inlineBackgroundImages(root: HTMLElement): Promise<void> {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('*'))

  await Promise.all(elements.map(async (element) => {
    const computedStyle = window.getComputedStyle(element)
    const backgroundImage = computedStyle.backgroundImage
    if (!backgroundImage || backgroundImage === 'none') return
    if (backgroundImage.includes('gradient(')) return

    const urlRegex = /url\((['"]?)(.*?)\1\)/g
    let replacement = backgroundImage
    let found = false
    let match: RegExpExecArray | null

    while ((match = urlRegex.exec(backgroundImage)) !== null) {
      found = true
      const url = match[2]
      if (!url || /^data:/i.test(url) || url.startsWith('blob:')) continue
      const absoluteUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url
      const dataUrl = await toDataUrl(absoluteUrl)
      if (dataUrl) {
        replacement = replacement.replace(match[0], `url("${dataUrl}")`)
      } else {
        // If image fails to load, replace with 'none' to keep CSS syntax valid
        // especially in comma-separated lists like `linear-gradient(...), none`
        replacement = replacement.replace(match[0], 'none')
      }
    }

    if (!found) return
    if (!replacement.trim() || replacement.trim() === 'url()' || /^none$/i.test(replacement.trim())) {
      element.style.backgroundImage = 'none'
    } else {
      element.style.backgroundImage = replacement
    }
  }))
}

/** Inline remote images and ensure SVGs have explicit dimensions so html2canvas embeds them reliably. */
export async function prepareElementForCapture(root: HTMLElement): Promise<void> {
  // 1. Process all SVG elements to prevent html2canvas failures by converting them to inline <img> tags
  const svgs = Array.from(root.querySelectorAll('svg')) as SVGElement[]
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect()
    
    let viewBoxWidth = 100
    let viewBoxHeight = 100
    const viewBox = svg.getAttribute('viewBox')
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/)
      if (parts.length === 4) {
        viewBoxWidth = parseFloat(parts[2]) || 100
        viewBoxHeight = parseFloat(parts[3]) || 100
      }
    }

    let width = rect.width > 0 ? rect.width : viewBoxWidth
    let height = rect.height > 0 ? rect.height : viewBoxHeight

    // Ensure we absolutely never set a 0 or negative width/height
    if (!width || width <= 0) width = viewBoxWidth || 24
    if (!height || height <= 0) height = viewBoxHeight || 24

    // Clone and set explicit width/height on the clone
    const svgClone = svg.cloneNode(true) as SVGElement
    svgClone.setAttribute('width', String(width))
    svgClone.setAttribute('height', String(height))
    svgClone.style.width = `${width}px`
    svgClone.style.height = `${height}px`

    try {
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgClone)
      const base64 = btoa(encodeURIComponent(svgString).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
      
      const img = document.createElement('img')
      img.src = `data:image/svg+xml;base64,${base64}`
      img.style.width = `${width}px`
      img.style.height = `${height}px`
      if (svg.className) {
        img.className = svg.className.baseVal || svg.className
      }
      
      if (svg.parentNode) {
        svg.parentNode.replaceChild(img, svg)
      }
    } catch (e) {
      console.warn('Failed to inline SVG to base64 image in PDF generator', e)
    }
  }

  // 2. Process all image elements
  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]

  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || /^data:/i.test(src)) return

      const absoluteSrc = src.startsWith('/') ? `${window.location.origin}${src}` : src
      if (!/^https?:\/\//i.test(absoluteSrc)) return

      const dataUrl = await toDataUrl(absoluteSrc)
      if (dataUrl) {
        img.setAttribute('src', dataUrl)
        img.removeAttribute('crossorigin')
      }
    })
  )

  await inlineBackgroundImages(root)
}

async function waitForFontsAndImages(root?: HTMLElement): Promise<void> {
  const imagePromises: Promise<void>[] = []

  if (root) {
    const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]
    images.forEach((img) => {
      imagePromises.push(
        Promise.race([
          waitForImageLoad(img),
          // Allow more time for remote images on slow connections or cross-origin conversions
          new Promise<void>((resolve) => setTimeout(resolve, 6000)),
        ])
      )
    })
  }

  const fontPromise = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve()
  await Promise.all([fontPromise, ...imagePromises])
  // small settle delay to ensure layout stabilizes before capture
  await new Promise((resolve) => setTimeout(resolve, 200))
}

function cleanupZeroSizeCanvases(root: HTMLElement): void {
  const canvases = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[]
  canvases.forEach((canvas) => {
    const rect = canvas.getBoundingClientRect()
    const hasZeroBounds = rect.width === 0 || rect.height === 0
    const hasZeroProps = canvas.width === 0 || canvas.height === 0
    const isHidden = canvas.style.display === 'none' || canvas.style.visibility === 'hidden'
    
    // Remove canvas if it has zero dimensions or is hidden
    if (hasZeroBounds || hasZeroProps || isHidden) {
      console.debug('[PDF] Removing zero-size/hidden canvas:', { 
        bounds: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        props: `${canvas.width}x${canvas.height}`,
        hidden: isHidden 
      })
      canvas.remove()
    }
  })
}

function cleanupProblematicImages(root: HTMLElement): void {
  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]
  images.forEach((img) => {
    const rect = img.getBoundingClientRect()
    const hasZeroBounds = rect.width === 0 || rect.height === 0
    const hasZeroNatural = img.naturalWidth === 0 || img.naturalHeight === 0
    const isHidden = img.style.display === 'none' || img.style.visibility === 'hidden'
    const hasNoSrc = !img.src || img.src === window.location.href || img.src.endsWith('/')
    
    if (hasZeroBounds || hasZeroNatural || isHidden || hasNoSrc) {
      console.debug('[PDF] Normalizing/cleaning up problematic image:', {
        src: img.src ? img.src.substring(0, 100) : 'none',
        bounds: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        natural: `${img.naturalWidth}x${img.naturalHeight}`,
        hidden: isHidden,
        noSrc: hasNoSrc
      })
      // Replace src with a 1x1 transparent GIF to prevent 0-size canvas pattern crash in html2canvas
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      
      if (hasZeroBounds) {
        img.style.width = '1px'
        img.style.height = '1px'
      }
    }
  })
}

/** Remove visual effects that can cause export artifacts during capture. */
function sanitizeForPdfCapture(root: HTMLElement): void {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  elements.forEach((element) => {
    element.style.boxShadow = 'none'
    element.style.textShadow = 'none'
    element.style.filter = 'none'
    element.style.backdropFilter = 'none'
    if (element.style.transform) {
      element.style.transform = 'none'
    }
  })
}

/** Inline computed styles for all elements in the cloned tree to preserve exact layout. */
function inlineAllComputedStyles(root: HTMLElement): void {
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]
  nodes.forEach((node) => {
    try {
      const computed = window.getComputedStyle(node as Element)
      let cssText = ''
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i]
        const val = computed.getPropertyValue(prop)
        cssText += `${prop}:${val};`
      }
      if (node instanceof HTMLElement) {
        node.style.cssText = `${node.style.cssText || ''} ${cssText}`
      }
    } catch (e) {
      // ignore computed style errors for some pseudo-elements or SVGs
    }
  })
}

export interface GeneratePdfOptions {
  /** The DOM element to capture */
  element: HTMLElement
  /** Output filename without extension */
  filename: string
  /** Orientation */
  orientation?: 'portrait' | 'landscape'
  /** Quality scale (higher = better quality but larger file, default 2) */
  scale?: number
  /** PDF Format (e.g. 'a4' or specific dimensions, defaults to [320, 510] for ID Cards) */
  format?: 'a4' | [number, number]
  /** Color mode for the generated PDF. 'color' or 'bw' (black & white) */
  colorMode?: 'color' | 'bw'
}

/**
 * Generates a PDF from a DOM element and returns it as a Blob.
 * This Blob can be uploaded to Cloudinary or downloaded locally.
 */
export async function generatePdfBlob({
  element,
  orientation = 'portrait',
  scale = 3, // High scale for print quality
  format,
  colorMode = 'color',
}: GeneratePdfOptions): Promise<Blob> {
  const docFormat = format || [320, 510]
  const pdfWidth = docFormat === 'a4' ? 595 : docFormat[0]
  const pdfHeight = docFormat === 'a4' ? 842 : docFormat[1]

  const clonedElement = element.cloneNode(true) as HTMLElement
  const captureTargetsPreview = Array.from(element.querySelectorAll('[data-card]')) as HTMLElement[]
  const isMultiCard = captureTargetsPreview.length > 0

  // Keep clone in viewport (off-screen clones often render blank in html2canvas)
  clonedElement.style.position = 'fixed'
  clonedElement.style.left = '0'
  clonedElement.style.top = '0'
  clonedElement.style.zIndex = '99999'
  clonedElement.style.opacity = '1'
  clonedElement.style.visibility = 'visible'
  clonedElement.style.pointerEvents = 'none'
  clonedElement.style.overflow = 'visible'
  clonedElement.style.transform = 'none'
  clonedElement.style.backgroundColor = '#ffffff'
  clonedElement.id = `${clonedElement.id ?? 'pdf-clone'}-pdf-copy`

  document.body.appendChild(clonedElement)
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

  // Match the original element's rendered size to preserve on-screen layout exactly
  try {
    const origRect = element.getBoundingClientRect()
    if (origRect.width && origRect.height) {
      clonedElement.style.width = `${Math.round(origRect.width)}px`
      clonedElement.style.height = isMultiCard ? 'auto' : `${Math.round(origRect.height)}px`
    }
  } catch (e) {
    // ignore
  }

  clonedElement.classList.add('pdf-export-clean')

  // Inline computed styles so the clone renders identically even when detached from site CSS rules
  try {
    inlineAllComputedStyles(clonedElement)
  } catch (e) {
    // non-fatal
  }

  sanitizeForPdfCapture(clonedElement)

  const captureTargets = Array.from(clonedElement.querySelectorAll('[data-card]')) as HTMLElement[]
  const pageTargets = Array.from(clonedElement.querySelectorAll('[data-document-page]')) as HTMLElement[]
  const targets =
    captureTargets.length > 0 ? captureTargets : pageTargets.length > 0 ? pageTargets : [clonedElement]

  const originalGetComputedStyle = window.getComputedStyle
  const originalCreatePattern = CanvasRenderingContext2D.prototype.createPattern
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage

  CanvasRenderingContext2D.prototype.createPattern = function (
    this: CanvasRenderingContext2D,
    image: CanvasImageSource,
    repetition: string | null
  ): CanvasPattern | null {
    if (image instanceof HTMLCanvasElement && (image.width === 0 || image.height === 0)) {
      console.warn('[PDF Patch] Intercepted 0-size canvas in createPattern, forcing 1x1 size to prevent crash.')
      image.width = 1
      image.height = 1
    }
    return originalCreatePattern.call(this, image, repetition)
  }

  CanvasRenderingContext2D.prototype.drawImage = function (
    this: CanvasRenderingContext2D,
    image: CanvasImageSource,
    ...args: any[]
  ): void {
    if (image instanceof HTMLCanvasElement && (image.width === 0 || image.height === 0)) {
      console.warn('[PDF Patch] Intercepted 0-size canvas in drawImage, forcing 1x1 size to prevent crash.')
      image.width = 1
      image.height = 1
    }
    return (originalDrawImage as any).apply(this, [image, ...args])
  }

  const originalAddColorStop = CanvasGradient.prototype.addColorStop
  CanvasGradient.prototype.addColorStop = function (
    this: CanvasGradient,
    offset: number,
    color: string
  ): void {
    if (!Number.isFinite(offset) || isNaN(offset)) {
      console.warn(`[PDF Patch] Intercepted non-finite offset (${offset}) in addColorStop for color ${color}. Defaulting to 0.`)
      offset = 0
    } else if (offset < 0) {
      offset = 0
    } else if (offset > 1) {
      offset = 1
    }
    return originalAddColorStop.call(this, offset, color)
  }

  window.getComputedStyle = function (elt, pseudoElt) {
    const style = originalGetComputedStyle(elt, pseudoElt)

    const safeColor = (val: string, propName: string): string => {
      if (!val) return val
      const lowerProp = propName.toLowerCase().replace(/-/g, '')
      
      if (val.includes('oklch') || val.includes('oklab') || val.includes('lab') || val.includes('color(')) {
        // If it is a background image, gradient, or contains oklch inside a gradient string
        if (val.includes('gradient') || val.includes('url(') || lowerProp.includes('backgroundimage')) {
          // Regex to parse oklch(...), oklab(...), lab(...), color(...) including decimal fractions
          const colorRegex = /(oklch|oklab|lab|color)\([^)]+\)/g
          return val.replace(colorRegex, (match) => {
            try {
              const canvas = document.createElement("canvas")
              canvas.width = 1
              canvas.height = 1
              const ctx = canvas.getContext("2d", { willReadFrequently: true })
              if (ctx) {
                ctx.fillStyle = match
                ctx.fillRect(0, 0, 1, 1)
                const data = ctx.getImageData(0, 0, 1, 1).data
                if (data[3] === 0 && !match.includes('transparent')) {
                  return 'rgba(255, 255, 255, 1)'
                }
                return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${(data[3] / 255).toFixed(3)})`
              }
            } catch (e) {
              console.warn('safeColor gradient translation failed for match:', match, e)
            }
            return match
          })
        }

        try {
          const canvas = document.createElement("canvas")
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext("2d", { willReadFrequently: true })
          if (ctx) {
            ctx.fillStyle = val
            ctx.fillRect(0, 0, 1, 1)
            const data = ctx.getImageData(0, 0, 1, 1).data
            if (data[3] === 0 && !val.includes('transparent')) {
              if (lowerProp.includes('background')) return 'rgb(255, 255, 255)'
              if (lowerProp.includes('color') && !lowerProp.includes('border')) return 'rgb(17, 24, 39)'
              if (lowerProp.includes('border')) return 'rgb(229, 231, 235)'
              return 'transparent'
            }
            return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${(data[3] / 255).toFixed(3)})`
          }
        } catch (e) {
          console.warn('safeColor canvas conversion failed for value:', val, e)
        }
        
        if (lowerProp.includes('background')) return 'rgb(255, 255, 255)'
        if (lowerProp.includes('color') && !lowerProp.includes('border')) return 'rgb(17, 24, 39)'
        if (lowerProp.includes('border')) return 'rgb(229, 231, 235)'
        return 'transparent'
      }
      return val
    }

    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return (propertyName: string) => {
            const val = target.getPropertyValue(propertyName)
            return safeColor(val, propertyName)
          }
        }
        const val = (target as any)[prop]
        if (typeof val === 'string') {
          return safeColor(val, String(prop))
        }
        if (typeof val === 'function') {
          return val.bind(target)
        }
        return val
      },
    })
  }

  let pdf: jsPDF | null = null

  try {
    await prepareElementForCapture(clonedElement)
    cleanupZeroSizeCanvases(clonedElement)
    await waitForFontsAndImages(clonedElement)
    cleanupProblematicImages(clonedElement)

    for (let index = 0; index < targets.length; index++) {
      const targetEl = targets[index]
      
      // Pre-capture canvas cleanup: ensure no zero-size canvases exist before html2canvas runs
      cleanupZeroSizeCanvases(targetEl)
      cleanupProblematicImages(targetEl)
      
      const originalBorderRadius = targetEl.style.borderRadius
      const originalBoxShadow = targetEl.style.boxShadow
      const originalTransform = targetEl.style.transform
      const originalWidth = targetEl.style.width
      const originalMinWidth = targetEl.style.minWidth

      targetEl.style.borderRadius = '0px'
      targetEl.style.boxShadow = 'none'
      targetEl.style.transform = 'none'

      try {
        const explicitWidth = targetEl.getAttribute('data-pdf-width')
        const scrollW = Math.round(targetEl.scrollWidth)
        const rect = targetEl.getBoundingClientRect()
        const captureWidth = explicitWidth
          ? parseInt(explicitWidth, 10)
          : Math.max(
              scrollW || Math.round(rect.width) || pdfWidth,
              595, // A4 minimum
            )
        // Force the element's own explicit width so the clone renders at exactly
        // captureWidth, not at whatever the parent container constrains it to.
        targetEl.style.width = `${captureWidth}px`
        targetEl.style.minWidth = `${captureWidth}px`
        targetEl.style.maxWidth = `${captureWidth}px`

        const explicitHeight = targetEl.getAttribute('data-pdf-height')
        const captureHeight = explicitHeight
          ? parseInt(explicitHeight, 10)
          : Math.max(
              Math.round(targetEl.scrollHeight) || Math.round(rect.height) || pdfHeight,
              1,
            )
        targetEl.style.height = `${captureHeight}px`
        targetEl.style.minHeight = `${captureHeight}px`
        targetEl.style.maxHeight = `${captureHeight}px`

        let canvas
        const canvasFilterFn = (element: Element) => {
          if (element.tagName.toLowerCase() === 'canvas') {
            const c = element as HTMLCanvasElement
            const rect = element.getBoundingClientRect()
            const isBadCanvas = 
              rect.width === 0 || 
              rect.height === 0 || 
              c.width === 0 || 
              c.height === 0 ||
              element.style.display === 'none' ||
              element.style.visibility === 'hidden' ||
              getComputedStyle(element).display === 'none'
            
            if (isBadCanvas) {
              console.debug('[html2canvas] Ignoring problematic canvas:', {
                bounds: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                props: `${c.width}x${c.height}`
              })
            }
            return isBadCanvas
          }
          return false
        }

        try {
          canvas = await html2canvas(targetEl, {
            scale,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: captureWidth,
            height: captureHeight,
            // WHY 1440: html2canvas uses windowWidth to evaluate CSS media queries
            // during capture. Setting it to captureWidth (e.g. 595) would fire
            // Tailwind's mobile breakpoints, collapsing flex rows and shrinking
            // font sizes. 1440 simulates a full desktop viewport — matching what
            // the user actually sees in the preview.
            windowWidth: 1440,
            windowHeight: 900,
            foreignObjectRendering: false,
            imageTimeout: 20000,
            scrollX: 0,
            scrollY: 0,
            ignoreElements: canvasFilterFn,
          })
        } catch (originalError) {
          const isCanvasPatternError = originalError instanceof Error && /createPattern|canvas/i.test(originalError.message)
          console.warn('[PDF] html2canvas failed, retrying with fallback:', originalError)
          
          const fallbackOpts = {
            scale,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: captureWidth,
            height: captureHeight,
            windowWidth: 1440,
            windowHeight: 900,
            foreignObjectRendering: !isCanvasPatternError,
            imageTimeout: 20000,
            scrollX: 0,
            scrollY: 0,
            ignoreElements: canvasFilterFn,
          }
          canvas = await html2canvas(targetEl, fallbackOpts)
        }

        // If a black-and-white print is requested, convert the captured
        // canvas into grayscale before embedding it in the PDF. This keeps
        // layout identical while ensuring professional monochrome output.
        const finalCanvas = ((): HTMLCanvasElement => {
          try {
            if (colorMode === 'bw') {
              const gray = document.createElement('canvas')
              gray.width = canvas.width
              gray.height = canvas.height
              const gctx = gray.getContext('2d')
              if (gctx) {
                gctx.drawImage(canvas, 0, 0)
                const imgd = gctx.getImageData(0, 0, gray.width, gray.height)
                const d = imgd.data
                for (let i = 0; i < d.length; i += 4) {
                  // Luminance formula (perceived brightness)
                  const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
                  d[i] = lum
                  d[i + 1] = lum
                  d[i + 2] = lum
                  // keep alpha as-is
                }
                gctx.putImageData(imgd, 0, 0)
                return gray
              }
            }
          } catch (e) {
            console.warn('Grayscale conversion failed, falling back to color capture', e)
          }
          return canvas
        })()

        const imgData = finalCanvas.toDataURL('image/png')
        if (!imgData || imgData.length < 100 || canvas.width === 0 || canvas.height === 0) {
          throw new Error('PDF capture produced an empty image. Please try again.')
        }

        const pageWidth = captureWidth
        const pageHeight = captureHeight
        const pageOrientation = pageWidth > pageHeight ? 'landscape' : 'portrait'

        const physicalUnit = targetEl.getAttribute('data-pdf-physical-unit') || 'px'
        const physicalWidthStr = targetEl.getAttribute('data-pdf-physical-width')
        const physicalHeightStr = targetEl.getAttribute('data-pdf-physical-height')
        
        const formatWidth = physicalWidthStr ? parseFloat(physicalWidthStr) : pageWidth
        const formatHeight = physicalHeightStr ? parseFloat(physicalHeightStr) : pageHeight

        if (!pdf) {
          pdf = new jsPDF({
            orientation: pageOrientation,
            unit: physicalUnit as any,
            format: [formatWidth, formatHeight],
          })
        } else {
          pdf.addPage([formatWidth, formatHeight], pageOrientation)
        }

        pdf.addImage(imgData, 'PNG', 0, 0, formatWidth, formatHeight)
      } finally {
        targetEl.style.borderRadius = originalBorderRadius
        targetEl.style.boxShadow = originalBoxShadow
        targetEl.style.transform = originalTransform
        targetEl.style.width = originalWidth
        targetEl.style.minWidth = originalMinWidth
      }
    }
  } finally {
    window.getComputedStyle = originalGetComputedStyle
    CanvasRenderingContext2D.prototype.createPattern = originalCreatePattern
    CanvasRenderingContext2D.prototype.drawImage = originalDrawImage
    CanvasGradient.prototype.addColorStop = originalAddColorStop
    if (clonedElement.parentNode) {
      clonedElement.parentNode.removeChild(clonedElement)
    }
  }

  if (!pdf) {
    throw new Error('PDF capture failed: no render targets found.')
  }

  return pdf.output('blob')
}

export async function generateBirthdayCertificate(options: {
  recipientName: string
  className?: string
  rollNo?: string
  date: string
  issuedBy?: string
  message?: string
  photo?: string
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateBirthdayCertificateDirect({
    ...options,
    photo: await toDataUrl(options.photo),
    qrCode: await toDataUrl(options.qrCode),
    logo,
  colorMode: options.colorMode,
  })
  pdf.save(`${options.recipientName.replace(/\s+/g, '_')}-Birthday-Certificate.pdf`)
}

export async function generateBonafideCertificate(options: {
  studentName: string
  fatherName: string
  className: string
  rollNo: string
  registrationNumber: string
  cnicBForm: string
  shift?: 'MORNING' | 'EVENING'
  issueDate: string
  validUntil?: string
  photo?: string
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateBonafideCertificateDirect({
    ...options,
    photo: await toDataUrl(options.photo),
    qrCode: await toDataUrl(options.qrCode),
    logo,
  colorMode: options.colorMode,
  })
  pdf.save(`${options.studentName.replace(/\s+/g, '_')}-Bonafide-Certificate.pdf`)
}

export async function generateResultCard(options: {
  studentName: string
  fatherName: string
  className: string
  rollNo: string
  registrationNumber: string
  subjects: Array<{ subject: string; total: number; obtained: number; grade: string; status: string }>
  totalPossible: number
  totalObtained: number
  percentage: number
  overallGrade: string
  photo?: string
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateResultCardDirect({
    name: options.studentName,
    studentClass: options.className,
    rollNo: options.rollNo,
    session: new Date().getFullYear().toString(),
    subjects: options.subjects.map((s) => ({
      subject: s.subject,
      marks: s.obtained,
      maxMarks: s.total,
    })),
    totalMarks: options.totalObtained,
    percentage: options.percentage,
    grade: options.overallGrade,
    logo,
    qrCode: await toDataUrl(options.qrCode),
    colorMode: options.colorMode,
  })
  pdf.save(`${options.studentName.replace(/\s+/g, '_')}-Result-Card.pdf`)
}

/** Report card from academic engine (published grading schemes). */
export async function generateAcademicReportCard(
  data: {
    studentName: string
    className: string
    rollNo: string
    registrationNumber: string
    session: string
    subjects: Array<{ subject: string; marks: number; maxMarks: number; grade: string }>
    totalObtained: number
    percentage: number
    overallGrade: string
    photo?: string | null
    attendancePct?: number | null
  },
  colorMode?: 'color' | 'bw'
): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateResultCardDirect({
    name: data.studentName,
    studentClass: data.className,
    rollNo: data.rollNo,
    session: data.session,
    subjects: data.subjects.map((s) => ({
      subject: s.subject,
      marks: s.marks,
      maxMarks: s.maxMarks,
    })),
    totalMarks: data.totalObtained,
    percentage: data.percentage,
    grade: data.overallGrade,
    logo,
    photo: data.photo ? await toDataUrl(data.photo) : undefined,
    colorMode,
  })
  const suffix = data.attendancePct != null ? `-Att${data.attendancePct}` : ''
  pdf.save(`${data.studentName.replace(/\s+/g, '_')}-Result-${data.session}${suffix}.pdf`)
}


export async function generatePerformanceCard(options: {
  name: string
  studentClass: string
  rollNo: string
  term: string
  subjects: Array<{ subject: string; marks: number; grade: string }>
  finalGrade: string
  attendance: string
  conduct: string
  photo?: string
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generatePerformanceCardDirect({
    ...options,
    photo: await toDataUrl(options.photo),
    qrCode: await toDataUrl(options.qrCode),
    logo,
    colorMode: options.colorMode,
  })
  pdf.save(`${options.name.replace(/\s+/g, '_')}-Performance-Card.pdf`)
}



export async function generateReport(options: {
  title: string
  generatedOn: string
  summary: string
  rows: Array<{ label: string; value: string }>
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateReportDirect({
    ...options,
    qrCode: await toDataUrl(options.qrCode),
    logo,
  colorMode: options.colorMode,
  })
  pdf.save(`${options.title.replace(/\s+/g, '_')}-Report.pdf`)
}

export async function generateIDCard(studentData: {
  name: string
  studentClass: string
  rollNo: string
  registrationNumber?: string
  dateOfBirth?: string
  shift?: 'MORNING' | 'EVENING'
  photo?: string
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon.png')
  const pdf = await generateIDCardDirect({
    ...studentData,
    photo: await toDataUrl(studentData.photo),
    qrCode: await toDataUrl(studentData.qrCode),
    logo,
    colorMode: studentData.colorMode,
  })
  const safeName = studentData.name.replace(/\s+/g, '_')
  pdf.save(`${studentData.registrationNumber ?? safeName}-id-card.pdf`)
}


/**
 * Convenience method to generate and immediately trigger a browser download
 */
export async function downloadPdf(options: GeneratePdfOptions): Promise<void> {
  const blob = await generatePdfBlob(options)
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `${options.filename}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

export async function generateTeacherProfile(teacherData: {
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  specialization?: string
  qualification: string
  experienceYears: number
  phoneNumber: string
  email: string
  cnic?: string
  emergencyContact?: string
  address: string
  city: string
  monthlySalary?: number
  joiningDate?: string
  isActive: boolean
  campusName?: string
  batchName?: string
  houseName?: string
  classes?: Array<{ class: { name: string }; isClassTeacher: boolean }>
  photo?: string
  qrCode?: string
  colorMode?: 'color' | 'bw'
}): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateTeacherProfileDirect({
    ...teacherData,
    photo: await toDataUrl(teacherData.photo),
    qrCode: await toDataUrl(teacherData.qrCode),
    logo,
    colorMode: teacherData.colorMode,
  })
  pdf.save(`${teacherData.firstName}_${teacherData.lastName}_Profile.pdf`)
}

/**
 * Generates and downloads a Teacher Staff ID Card PDF (85×54mm, front + back).
 * Bypasses html2canvas — uses the jsPDF direct generator for print-grade fidelity.
 * WHY bypass: html2canvas only captures the DOM face currently visible, missing the
 * back side entirely. The direct generator renders both faces in one jsPDF instance.
 */
export async function generateTeacherIDCard(
  data: Omit<TeacherIDCardData, 'photo' | 'qrCode' | 'logo'> & {
    photo?: string
    qrCode?: string
    colorMode?: 'color' | 'bw'
  }
): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateTeacherIDCardDirect({
    ...data,
    photo: await toDataUrl(data.photo),
    qrCode: await toDataUrl(data.qrCode),
    logo,
  })
  const safeName = data.name.replace(/\s+/g, '_')
  pdf.save(`${data.employeeId}-${safeName}-staff-id-card.pdf`)
}

/**
 * Generates and downloads a Teacher Experience Letter PDF (A4 portrait).
 * Uses the jsPDF direct generator — no html2canvas involved.
 */
export async function generateExperienceLetter(
  data: Omit<ExperienceLetterData, 'logo'> & { colorMode?: 'color' | 'bw' }
): Promise<void> {
  const logo = await toDataUrl('/favicon-128x128.png')
  const pdf = await generateExperienceLetterDirect({ ...data, logo })
  const safeName = `${data.firstName}_${data.lastName}`.replace(/\s+/g, '_')
  pdf.save(`${data.employeeId}-${safeName}-experience-letter.pdf`)
}
