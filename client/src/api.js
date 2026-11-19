import { useEffect, useState } from 'react'

export async function request(path, { method = 'GET', body, ...rest } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest
  })
  let data = null
  try { data = await res.json() } catch { /* respuesta vacía */ }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'))
    const err = new Error(data?.error || `Error ${res.status}`)
    err.status = res.status
    err.details = data?.details
    throw err
  }
  return data
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' })
}

export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    loader()
      .then((result) => { if (alive) { setData(result); setError(null) } })
      .catch((err) => { if (alive) setError(err.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}

export const money = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)

export const parseDate = (value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, d] = String(value).split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export const dateShort = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(parseDate(value))
}

export const dateLong = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(parseDate(value))
}

export const timeShort = (value) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(parseDate(value))
}

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const nowStamp = () => {
  const d = new Date()
  return `${todayStr()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const mapsFor = (event) => {
  if (event.maps_url) return event.maps_url
  const query = event.address || event.location_name
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}
