// Utilidades para invitar y confirmar músicos en un evento, sin librerías externas.
// Se mantienen separadas del componente para poder probarlas sin DOM.

function fmtStamp(value) {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value))
  if (!match) return String(value)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

// Intl ya termina en «p.m.» en es-MX: no queremos «p.m..».
const withPeriod = (text) => (text && !/[.!?]$/.test(text) ? `${text}.` : text)

const fmtMoney = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)

export function waNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.startsWith('52') ? digits : '52' + digits
}

export function waLink(phone, message) {
  const number = waNumber(phone)
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(message)}`
}

export function mapsForEvent(event) {
  if (event.maps_url) return event.maps_url
  const query = event.address || event.location_name
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : ''
}

// Cada dato en su propia línea con emoji, para que WhatsApp se lea de un vistazo.
function eventLogistics(event) {
  const place = [event.location_name, event.address].filter(Boolean).join(' — ')
  const maps = mapsForEvent(event)
  const tandas = Math.round(Number(event.tandas)) || 0
  return [
    event.starts_at ? `📅 Fecha: ${withPeriod(fmtStamp(event.starts_at))}` : null,
    tandas > 0 ? `⏱️ Tandas: ${tandas} (${tandas} hora${tandas === 1 ? '' : 's'}).` : null,
    event.ends_at ? `🏁 Fin estimado: ${withPeriod(fmtStamp(event.ends_at))}` : null,
    place ? `📍 Lugar: ${place}.` : null,
    maps ? `🗺️ Ubicación: ${maps}` : null,
    event.band_name ? `🎼 Agrupación: ${event.band_name}.` : null,
    event.notes ? `📝 Notas: ${event.notes}` : null
  ].filter((line) => line !== null)
}

const titleLine = (event) => `🎺 *${event.title || 'Evento'}* 🎺`

// Vista previa general: solo logística, sin nombres de músicos ni importes.
export function buildEventMessage(event) {
  return [
    titleLine(event),
    '',
    ...eventLogistics(event),
    '',
    'Enviado desde MariachiTotal'
  ].join('\n')
}

// Invitación pública: mismo detalle con emojis + el enlace para confirmar.
export function buildInviteMessage(event, publicUrl) {
  return [
    'Hola 👋, te invito a este evento:',
    '',
    titleLine(event),
    '',
    ...eventLogistics(event),
    '',
    publicUrl ? `👉 Confirma si puedes asistir aquí: ${publicUrl}` : null,
    '',
    'Enviado desde MariachiTotal'
  ].filter((line) => line !== null).join('\n')
}

// Datos completos del evento para un músico ya confirmado: su nombre y el pago
// capturado en el evento. No lleva enlace ni el texto de invitación.
export function buildMusicianMessage(event, musician) {
  const name = String(musician?.name || '').trim()
  const tandas = Math.round(Number(event.tandas)) || 0
  const rate = Number(musician?.payment_per_tanda ?? musician?.invite_rate_per_tanda) || 0
  const amount = Number(musician?.payment_amount) || (rate > 0 && tandas > 0 ? rate * tandas : 0)
  return [
    name ? `Hola ${name} 👋,` : 'Hola 👋,',
    '',
    titleLine(event),
    '',
    ...eventLogistics(event),
    '',
    amount > 0 || rate > 0
      ? `💰 Tu pago: *${fmtMoney(amount)}*${rate > 0 ? ` (${fmtMoney(rate)} por tanda)` : ''}${musician?.paid ? ' · ya pagado' : ''}`
      : null,
    '',
    'Enviado desde MariachiTotal'
  ].filter((line) => line !== null).join('\n')
}

// Mensaje individual post-confirmación: aquí sí aparece SU pago.
export function buildConfirmationMessage(event, response) {
  const first = String(response?.name || '').trim().split(/\s+/)[0]
  const tandas = Math.round(Number(event.tandas)) || 0
  const rate = Number(response?.payment_per_tanda ?? response?.invite_rate_per_tanda) || 0
  const amount = Number(response?.payment_amount) || (rate > 0 && tandas > 0 ? rate * tandas : 0)
  return [
    first ? `Hola ${first} 👋,` : 'Hola 👋,',
    '',
    titleLine(event),
    '',
    ...eventLogistics(event),
    '',
    amount > 0 || rate > 0
      ? `💰 Tu pago: *${fmtMoney(amount)}*${rate > 0 ? ` (${fmtMoney(rate)} por tanda)` : ''}`
      : null,
    '✅ Asistencia confirmada',
    '',
    'Enviado desde MariachiTotal'
  ].filter((line) => line !== null).join('\n')
}
