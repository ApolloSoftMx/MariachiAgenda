// Utilidades para compartir cotizaciones sin depender de librerías externas.

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)

function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export function downloadQuotePng(quote) {
  const canvas = document.createElement('canvas')
  const width = 1080
  const height = 1400
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  ctx.fillStyle = '#f6f3fb'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#52218c'
  ctx.fillRect(0, 0, width, 190)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 42px Inter, system-ui, sans-serif'
  ctx.fillText('AGENDA MARIACHI', 70, 85)
  ctx.font = '600 30px Inter, system-ui, sans-serif'
  ctx.fillText('Cotización', 70, 140)

  ctx.fillStyle = '#241a3d'
  ctx.font = '700 48px Inter, system-ui, sans-serif'
  let y = 270
  for (const line of wrap(ctx, quote.title || 'Cotización', width - 140).slice(0, 3)) {
    ctx.fillText(line, 70, y)
    y += 58
  }

  y += 22
  ctx.font = '400 30px Inter, system-ui, sans-serif'
  const place = [quote.location_name, quote.address].filter(Boolean).join(' — ')
  const maps = quote.maps_url || (place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : '')
  const rows = [
    ['Cliente', quote.client_name],
    ['Teléfono', quote.client_phone],
    ['Fecha del evento', quote.event_date ? `${quote.event_date} ${quote.event_time || '19:00'}` : ''],
    ['Ubicación', place],
    ['Depósito', Number(quote.deposit_amount) > 0 ? fmt(quote.deposit_amount) : ''],
    ['Vigencia', quote.valid_until],
    ['Músicos planeados', quote.musicians_planned],
    ['Estatus', { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada' }[quote.status] || quote.status]
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
  for (const [label, value] of rows) {
    ctx.fillStyle = '#6b6280'
    ctx.fillText(label, 70, y)
    ctx.fillStyle = '#241a3d'
    ctx.font = '600 30px Inter, system-ui, sans-serif'
    ctx.fillText(String(value), 420, y)
    ctx.font = '400 30px Inter, system-ui, sans-serif'
    y += 48
  }

  y += 20
  ctx.fillStyle = '#52218c'
  ctx.font = '700 44px Inter, system-ui, sans-serif'
  ctx.fillText(`Total: ${fmt(quote.amount)}`, 70, y)
  y += 60

  const blocks = [
    ['Ubicación en Maps', maps],
    ['Descripción', quote.description],
    ['Notas', quote.notes],
    ['Datos para depósito', [quote.account_name, quote.account_details, quote.deposit_details].filter(Boolean).join('\n')]
  ].filter(([, value]) => value)
  for (const [label, value] of blocks) {
    ctx.fillStyle = '#52218c'
    ctx.font = '700 30px Inter, system-ui, sans-serif'
    ctx.fillText(label, 70, y)
    y += 42
    ctx.fillStyle = '#241a3d'
    ctx.font = '400 27px Inter, system-ui, sans-serif'
    for (const line of wrap(ctx, value, width - 140).slice(0, 7)) {
      if (y > height - 80) break
      ctx.fillText(line, 70, y)
      y += 38
    }
    y += 24
  }

  ctx.fillStyle = '#6b6280'
  ctx.font = '400 24px Inter, system-ui, sans-serif'
  ctx.fillText('Generada desde la app Agenda Mariachi', 70, height - 40)

  const link = document.createElement('a')
  link.download = `cotizacion-${quote.id || 'nueva'}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  return true
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}
