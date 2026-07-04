/** Renders a side-by-side before/after PNG and triggers a download. */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

export interface ExportOptions {
  beforeSrc: string
  afterSrc: string
  beforeLabel: string
  afterLabel: string
  attribution: string
  fileName?: string
}

export async function exportComparisonPng(opts: ExportOptions): Promise<void> {
  const [before, after] = await Promise.all([
    loadImage(opts.beforeSrc),
    loadImage(opts.afterSrc),
  ])

  const paneH = 800
  const gap = 8
  const beforeW = Math.round((before.naturalWidth / before.naturalHeight) * paneH)
  const afterW = Math.round((after.naturalWidth / after.naturalHeight) * paneH)
  const labelH = 48
  const footerH = 40
  const width = beforeW + gap + afterW
  const height = labelH + paneH + footerH

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  ctx.fillStyle = '#111318'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#e8eaf0'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(opts.beforeLabel, 12, labelH / 2)
  ctx.textAlign = 'right'
  ctx.fillText(opts.afterLabel, width - 12, labelH / 2)
  ctx.textAlign = 'left'

  ctx.drawImage(before, 0, labelH, beforeW, paneH)
  ctx.drawImage(after, beforeW + gap, labelH, afterW, paneH)

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillText(opts.attribution, 12, labelH + paneH + footerH / 2)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('PNG export failed')

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = opts.fileName ?? 'before-after.png'
  a.click()
  URL.revokeObjectURL(a.href)
}
