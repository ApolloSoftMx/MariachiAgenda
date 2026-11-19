// Utilidades de fecha en hora local. Cada tanda equivale a una hora entera.
const pad = (n) => String(n).padStart(2, '0')

export const normalizeTandas = (value) => {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 48)
}

export function addHoursToStamp(stamp, hours) {
  const tandas = normalizeTandas(hours)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(stamp || ''))
  if (!tandas || !match) return ''
  const date = new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5])
  )
  date.setHours(date.getHours() + tandas)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const quoteEndStamp = (quote) =>
  quote?.event_date ? addHoursToStamp(`${quote.event_date}T${quote.event_time || '19:00'}`, quote.tandas) : ''
