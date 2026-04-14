import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: null,
    allowTaint: true,
    scrollX: 0,
    scrollY: -window.scrollY,
  })
}

/** Stack canvases vertically; scales each to the max width so edges align. */
function mergeCanvasesVertical(canvases: HTMLCanvasElement[], gapPx: number, bg = '#0f172a'): HTMLCanvasElement {
  if (canvases.length === 0) {
    const empty = document.createElement('canvas')
    empty.width = 1
    empty.height = 1
    return empty
  }
  const w = Math.max(...canvases.map((c) => c.width))

  const normalized = canvases.map((c) => {
    if (c.width === w) return c
    const h = Math.round((c.height * w) / c.width)
    const x = document.createElement('canvas')
    x.width = w
    x.height = h
    x.getContext('2d')!.drawImage(c, 0, 0, w, h)
    return x
  })

  const totalH = normalized.reduce((s, c) => s + c.height, 0) + gapPx * (normalized.length - 1)
  const merged = document.createElement('canvas')
  merged.width = w
  merged.height = totalH
  const ctx = merged.getContext('2d')
  if (!ctx) return normalized[0]
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, totalH)
  let y = 0
  for (let i = 0; i < normalized.length; i++) {
    if (i > 0) y += gapPx
    ctx.drawImage(normalized[i], 0, y)
    y += normalized[i].height
  }
  return merged
}

function addCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, margin: number): void {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const destW = pageW - 2 * margin
  const maxDestH = pageH - 2 * margin
  const totalDestH = (canvas.height * destW) / canvas.width

  if (totalDestH <= maxDestH) {
    const imgData = canvas.toDataURL('image/png', 1.0)
    pdf.addImage(imgData, 'PNG', margin, margin, destW, totalDestH)
    return
  }

  const srcHPerPage = (maxDestH / totalDestH) * canvas.height
  let srcY = 0
  let first = true
  while (srcY < canvas.height - 0.5) {
    const srcSliceH = Math.min(Math.ceil(srcHPerPage), canvas.height - srcY)
    if (srcSliceH < 1) break
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = srcSliceH
    const ctx = slice.getContext('2d')
    if (!ctx) break
    ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH)
    const sliceData = slice.toDataURL('image/png', 1.0)
    const destH = (srcSliceH * destW) / canvas.width
    if (!first) pdf.addPage()
    pdf.addImage(sliceData, 'PNG', margin, margin, destW, destH)
    first = false
    srcY += srcSliceH
  }
}

export type BuildSummaryPdfOptions = {
  filenameHours?: number
  brandEl?: HTMLElement | null
  /** In reading order: e.g. summary top (through current trend), previous-window trend (PDF-only mount), summary bottom */
  segments: HTMLElement[]
}

/**
 * Captures ordered DOM segments (plus optional PDF-only brand), merges vertically, outputs multi-page PDF.
 */
export async function buildSummaryPdf(opts: BuildSummaryPdfOptions): Promise<void> {
  const { brandEl, segments } = opts
  if (segments.length === 0) throw new Error('No content to export')

  const gapPx = 32
  const baseW = Math.max(320, Math.round(segments[0].getBoundingClientRect().width))
  const resets: { el: HTMLElement; prev: string }[] = []

  const setW = (el: HTMLElement | null | undefined) => {
    if (!el) return
    resets.push({ el, prev: el.style.width })
    el.style.width = `${baseW}px`
  }

  setW(brandEl ?? undefined)
  segments.forEach((s) => setW(s))

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const segmentCanvases = await Promise.all(segments.map((s) => captureElement(s)))
    let stack = mergeCanvasesVertical(segmentCanvases, gapPx)

    if (brandEl) {
      const brandCanvas = await captureElement(brandEl)
      stack = mergeCanvasesVertical([brandCanvas, stack], gapPx)
    }

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
    const margin = 24
    addCanvasToPdf(pdf, stack, margin)

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const h = opts.filenameHours ?? 'summary'
    pdf.save(`governbot-summary-${h}h-${stamp}.pdf`)
  } finally {
    resets.forEach(({ el, prev }) => {
      el.style.width = prev
    })
  }
}
