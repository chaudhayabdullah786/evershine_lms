/**
 * lib/html2canvas-safe.ts
 *
 * Drop-in wrapper around html2canvas that patches `getComputedStyle` to
 * convert modern CSS color functions (`lab()`, `oklch()`, `oklab()`,
 * `lch()`, `color()`) into `rgba()` before html2canvas parses them.
 *
 * WHY: html2canvas v1.4.x only supports `rgb()`, `rgba()`, `hsl()`,
 * `hsla()`, and hex colours. Tailwind CSS v4 uses `oklch()` and the
 * browser resolves them to `lab()` in computed styles. html2canvas
 * throws "Attempting to parse an unsupported color function 'lab'"
 * and the entire capture aborts.
 *
 * APPROACH: We temporarily monkey-patch `window.getComputedStyle` to
 * return a Proxy that intercepts any property read containing a modern
 * colour function and converts it to `rgba()` using a 1×1 canvas
 * rasterisation trick. This is the same technique used in lib/pdf.ts
 * but extracted here for reuse across all html2canvas call sites.
 *
 * TRADEOFF: The Proxy adds negligible overhead per style read (~0.01ms)
 * because the canvas rasterisation only fires for values that actually
 * contain modern color functions, which is a small subset of all
 * computed style reads.
 */

import html2canvas, { type Options } from 'html2canvas'

/**
 * Converts a modern CSS color value to rgba() using canvas rasterisation.
 *
 * @param val - The CSS color value string (may contain lab(), oklch(), etc.)
 * @param propName - The CSS property name (used for fallback defaults)
 * @returns An rgba() string safe for html2canvas, or the original value
 */
function safeColor(val: string, propName: string): string {
  if (!val) return val

  const lowerProp = propName.toLowerCase().replace(/-/g, '')

  // Fast path: skip values that don't contain modern color functions
  if (
    !val.includes('oklch') &&
    !val.includes('oklab') &&
    !val.includes('lab(') &&
    !val.includes('lch(') &&
    !val.includes('color(')
  ) {
    return val
  }

  // Handle gradient strings that contain modern colors embedded inside
  if (val.includes('gradient') || val.includes('url(') || lowerProp.includes('backgroundimage')) {
    const colorRegex = /(oklch|oklab|lab|lch|color)\([^)]+\)/g
    return val.replace(colorRegex, (match) => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.fillStyle = match
          ctx.fillRect(0, 0, 1, 1)
          const data = ctx.getImageData(0, 0, 1, 1).data
          if (data[3] === 0 && !match.includes('transparent')) {
            return 'rgba(255, 255, 255, 1)'
          }
          return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${(data[3] / 255).toFixed(3)})`
        }
      } catch {
        // Fallback: return a safe default
      }
      return 'rgba(255, 255, 255, 1)'
    })
  }

  // Handle standalone color values
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
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
  } catch {
    // Canvas conversion failed — return safe defaults
  }

  // Final fallback based on property type
  if (lowerProp.includes('background')) return 'rgb(255, 255, 255)'
  if (lowerProp.includes('color') && !lowerProp.includes('border')) return 'rgb(17, 24, 39)'
  if (lowerProp.includes('border')) return 'rgb(229, 231, 235)'
  return 'transparent'
}

/**
 * Creates a Proxy around a CSSStyleDeclaration that intercepts modern
 * color function reads and converts them to rgba().
 */
function createSafeStyleProxy(style: CSSStyleDeclaration): CSSStyleDeclaration {
  return new Proxy(style, {
    get(target, prop) {
      if (prop === 'getPropertyValue') {
        return (propertyName: string) => {
          const val = target.getPropertyValue(propertyName)
          return safeColor(val, propertyName)
        }
      }
      const val = (target as unknown as Record<string | symbol, unknown>)[prop]
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

/**
 * Safe html2canvas wrapper that handles modern CSS color functions.
 *
 * @param element - The DOM element to capture
 * @param options - html2canvas options (same API as html2canvas)
 * @returns A canvas element with the captured content
 *
 * @example
 * ```ts
 * import { html2canvasSafe } from '@/lib/html2canvas-safe'
 *
 * const canvas = await html2canvasSafe(element, {
 *   scale: 2,
 *   useCORS: true,
 *   backgroundColor: '#ffffff',
 * })
 * ```
 */
export async function html2canvasSafe(
  element: HTMLElement,
  options?: Partial<Options>,
): Promise<HTMLCanvasElement> {
  const originalGetComputedStyle = window.getComputedStyle

  // Monkey-patch getComputedStyle to intercept modern color functions
  window.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
    const style = originalGetComputedStyle(elt, pseudoElt)
    return createSafeStyleProxy(style)
  } as typeof window.getComputedStyle

  try {
    const canvas = await html2canvas(element, options)
    return canvas
  } finally {
    // Always restore the original — even if html2canvas throws
    window.getComputedStyle = originalGetComputedStyle
  }
}

export default html2canvasSafe
