import { Download, FileText } from 'lucide-react'

// jsPDF and html2canvas are large, so they are loaded only when someone actually exports.
async function renderCard(targetId: string) {
  const target = document.getElementById(targetId)
  if (!target) return null
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(target, { backgroundColor: '#11110F', scale: 2, useCORS: true })
}

export function ExportButtons({ targetId }: { targetId: string }) {
  const exportPng = async () => {
    const canvas = await renderCard(targetId)
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'arsenic-developer-card.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const exportPdf = async () => {
    const canvas = await renderCard(targetId)
    if (!canvas) return
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 2, canvas.height / 2] })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width / 2, canvas.height / 2)
    pdf.save('arsenic-developer-card.pdf')
  }

  return (
    <div className="exportActions">
      <button className="ghostBtn" onClick={exportPng}><Download size={15} />PNG</button>
      <button className="ghostBtn" onClick={exportPdf}><FileText size={15} />PDF</button>
    </div>
  )
}
