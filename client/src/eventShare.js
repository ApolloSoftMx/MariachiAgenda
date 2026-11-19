// Utilidades para invitar a los músicos a un evento, sin librerías externas.
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

// Mensaje general: solo logística. Nunca incluye nombres de músicos ni importes.
export function buildEventMessage(event) {
  const place = [event.location_name, event.address].filter(Boolean).join(' — ')
  const maps = mapsForEvent(event)
  const tandas = Math.round(Number(event.tandas)) || 0
  return [
    `Evento: ${event.title || 'Sin título'}`,
    event.starts_at ? `Fecha: ${withPeriod(fmtStamp(event.starts_at))}` : '',
    tandas > 0 ? `Tandas: ${tandas} (${tandas} hora${tandas === 1 ? '' : 's'}).` : '',
    event.ends_at ? `Fin estimado: ${withPeriod(fmtStamp(event.ends_at))}` : '',
    place ? `Lugar: ${place}.` : '',
    maps ? `Ubicación en Maps: ${maps}` : '',
    event.band_name ? `Agrupación: ${event.band_name}.` : '',
    event.notes ? `Notas: ${event.notes}` : '',
    'Enviado desde MariachiTotal'
  ].filter(Boolean).join('\n')
}

// El enlace público sustituye a los mensajes individuales: cada músico entra,
// se identifica con nombre y teléfono y confirma o rechaza su asistencia.
export function buildInviteMessage(event, publicUrl) {
  const logistics = buildEventMessage(event)
    .split('\n')
    .filter((line) => line && !line.startsWith('Evento:') && line !== 'Enviado desde MariachiTotal')
  return [
    `Hola 👋, te invito a ${event.title || 'un evento'}.`,
    ...logistics,
    publicUrl ? `Confirma si puedes asistir aquí: ${publicUrl}` : '',
    'Enviado desde MariachiTotal'
  ].filter(Boolean).join('\n')
}
