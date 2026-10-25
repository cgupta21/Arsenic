import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'

// jsPDF and html2canvas are large, so they are loaded only when someone actually exports.
async function renderCard(targetId: string): Promise<HTMLCanvasElement | null> {
  const target = document.getElementById(targetId)
  if (!target) return null

  // Ensure custom web fonts are rendered before canvas rasterization
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Non-fatal if fonts API is unavailable
    }
  }

  // Ensure all images (such as GitHub avatars and SVGs) are fully loaded
  const images = Array.from(target.querySelectorAll('img'))
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    })
  )

  const { default: html2canvas } = await import('html2canvas')
  // Use scale: 2 for sharp Retina/high-DPI output while preventing mobile Safari memory limit crashes
  return html2canvas(target, {
    backgroundColor: '#11110F',
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 10000,
  })
}

export function ExportButtons({ targetId }: { targetId: string }) {
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exportPng = async () => {
    if (exporting) return
    setExporting('png')
    setError(null)

    try {
      const canvas = await renderCard(targetId)
      if (!canvas) throw new Error('Card element could not be found.')

      // Prefer toBlob + ObjectURL over toDataURL for reliable mobile Safari / Android Chrome downloads
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not create image blob.')

      const fileName = 'arsenic-developer-card.png'
      const file = new File([blob], fileName, { type: 'image/png' })

      // On mobile devices with Web Share API support, invoke the native share sheet
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Arsenic Developer Card',
            text: 'Arsenic developer intelligence profile card.',
          })
          return
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === 'AbortError') return
          // Fallback to standard file download if user or browser rejected share
        }
      }

      // Standard programmatic anchor download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = fileName
      link.href = url
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      console.error('PNG export failed:', err)
      setError('PNG export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  const exportPdf = async () => {
    if (exporting) return
    setExporting('pdf')
    setError(null)

    try {
      const canvas = await renderCard(targetId)
      if (!canvas) throw new Error('Card element could not be found.')

      const { jsPDF } = await import('jspdf')
      // Dimensions in CSS pixels (canvas rendered at scale 2)
      const width = canvas.width / 2
      const height = canvas.height / 2
      const orientation = width >= height ? 'landscape' : 'portrait'

      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [width, height],
      })

      // Pass canvas directly to jsPDF to avoid large intermediate base64 string allocations in memory
      pdf.addImage(canvas, 'PNG', 0, 0, width, height)

      const fileName = 'arsenic-developer-card.pdf'
      const pdfBlob = pdf.output('blob')
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' })

      // Check native mobile share first
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Arsenic Developer Card',
          })
          return
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === 'AbortError') return
        }
      }

      pdf.save(fileName)
    } catch (err) {
      console.error('PDF export failed:', err)
      setError('PDF export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="exportContainer">
      <div className="exportActions">
        <button
          className="ghostBtn"
          onClick={exportPng}
          disabled={exporting !== null}
          aria-label="Export profile card as PNG image"
        >
          {exporting === 'png' ? <Loader2 size={15} className="spinner" /> : <Download size={15} />}
          {exporting === 'png' ? 'Exporting…' : 'PNG'}
        </button>
        <button
          className="ghostBtn"
          onClick={exportPdf}
          disabled={exporting !== null}
          aria-label="Export profile card as PDF document"
        >
          {exporting === 'pdf' ? <Loader2 size={15} className="spinner" /> : <FileText size={15} />}
          {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
        </button>
      </div>
      {error && <span className="exportError" role="alert">{error}</span>}
    </div>
  )
}
