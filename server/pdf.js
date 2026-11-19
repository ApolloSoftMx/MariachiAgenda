// Generador mínimo de PDF (sin dependencias). Solo texto con Helvetica/WinAnsi.
// Suficiente para cotizaciones en español con acentos.

import { quoteEndStamp } from './datetime.js'

const clean = (value) => String(value ?? '')
  .replace(/[^\x20-\x7E\xA1-\xFF]/g, '?')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')

export const moneyText = (n) =>
  `$${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

export function mapsForQuote(quote) {
  if (quote?.maps_url) return quote.maps_url
  const query = [quote?.address, quote?.location_name].filter(Boolean).join(', ')
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : ''
}

function wrap(text, max = 92) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max) {
      if (line) lines.push(line)
      line = word
    } else {
      line = (line + ' ' + word).trim()
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function buildQuoteLines(quote) {
  const lines = []
  lines.push([quote.title || 'Cotización', 16, 762])
  lines.push([`Cliente: ${quote.client_name || '—'}`, 12, 738])
  if (quote.client_phone) lines.push([`Teléfono: ${quote.client_phone}`, 11, 720])
  lines.push([`Fecha del evento: ${quote.event_date || 'Por definir'} ${quote.event_time || '19:00'}`, 11, 702])
  let metaY = 684
  if (Number(quote.tandas) > 0) {
    lines.push([`Tandas: ${quote.tandas} (${quote.tandas} h) · Fin estimado: ${quoteEndStamp(quote)}`, 11, metaY])
    metaY -= 18
  }
  if (Number(quote.rate_per_tanda) > 0) {
    lines.push([`Pago por tanda: ${moneyText(quote.rate_per_tanda)}`, 11, metaY]); metaY -= 18
  }
  if (quote.valid_until) { lines.push([`Vigencia: ${quote.valid_until}`, 11, metaY]); metaY -= 18 }
  lines.push([`Músicos planeados: ${quote.musicians_planned || 0}`, 11, metaY])
  lines.push([`Total: ${moneyText(quote.amount)}`, 14, metaY - 24])
  const hasDeposit = Number(quote.deposit_amount) > 0
  if (hasDeposit) lines.push([`Depósito a registrar: ${moneyText(quote.deposit_amount)}`, 11, metaY - 42])

  let y = hasDeposit ? metaY - 66 : metaY - 48
  const place = [quote.location_name, quote.address].filter(Boolean).join(' — ')
  if (place) {
    lines.push(['Ubicación', 12, y]); y -= 18
    for (const text of wrap(place)) { lines.push([text, 10, y]); y -= 15 }
    y -= 6
  }
  const maps = mapsForQuote(quote)
  if (maps) {
    lines.push([`Maps: ${maps}`, 9, y]); y -= 22
  }

  if (quote.description) {
    lines.push(['Descripción', 12, y]); y -= 20
    for (const text of wrap(quote.description)) { lines.push([text, 10, y]); y -= 16 }
    y -= 8
  }
  if (quote.notes) {
    lines.push(['Notas', 12, y]); y -= 20
    for (const text of wrap(quote.notes)) { lines.push([text, 10, y]); y -= 16 }
    y -= 8
  }

  lines.push(['Datos para depósito', 12, y]); y -= 20
  if (quote.account_name) { lines.push([quote.account_name, 11, y]); y -= 16 }
  if (quote.account_details) {
    for (const text of wrap(quote.account_details)) { lines.push([text, 10, y]); y -= 16 }
  }
  if (quote.deposit_details) {
    for (const text of wrap(quote.deposit_details)) { lines.push([text, 10, y]); y -= 16 }
  }
  if (!quote.account_name && !quote.account_details && !quote.deposit_details) {
    lines.push(['Depósito: el super administrador aún no registra una cuenta.', 10, y]); y -= 16
  }

  lines.push([`Estatus: ${statusLabel(quote.status)}`, 10, Math.max(y - 12, 60)])
  lines.push(['MariachiTotal · Cotización generada desde la app', 9, 42])
  return lines
}

export function statusLabel(status) {
  return {
    draft: 'Borrador',
    sent: 'Enviada',
    accepted: 'Aceptada',
    rejected: 'Rechazada'
  }[status] || status || 'Borrador'
}

export function quotePdf(quote) {
  const lines = buildQuoteLines(quote)
  let content = '0.32 0.12 0.55 rg\n0 790 595 52 re f\n'
  content += '1 1 1 rg\n'
  content += `BT /F1 18 Tf 40 807 Td (${clean('MARIACHITOTAL')}) Tj ET\n`
  content += '0 0 0 rg\n'
  for (const [text, size, y] of lines) {
    content += `BT /F1 ${size} Tf 40 ${y} Td (${clean(text)}) Tj ET\n`
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((obj, i) => {
    offsets[i + 1] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}
