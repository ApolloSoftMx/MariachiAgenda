import { all, one, run, db } from './db.js'

export const EVENT_SELECT = `
  SELECT e.*, c.name AS client_name, c.phone AS client_phone,
         b.name AS band_name, b.kind AS band_kind, b.responsable AS band_responsable,
         b.color AS band_color, a.name AS advance_account_name,
         (SELECT COUNT(*) FROM event_musicians em WHERE em.event_id = e.id) AS musician_count,
         (SELECT COALESCE(SUM(em.payment_amount), 0) FROM event_musicians em WHERE em.event_id = e.id) AS musician_total,
         (SELECT COALESCE(SUM(em.payment_amount), 0) FROM event_musicians em WHERE em.event_id = e.id AND em.paid = 1) AS musician_paid
  FROM events e
  LEFT JOIN clients c ON c.id = e.client_id
  LEFT JOIN bands b ON b.id = e.band_id
  LEFT JOIN accounts a ON a.id = e.advance_account_id
`

export const getEvent = (id) => one(EVENT_SELECT + ' WHERE e.id = ?', id)

export function listEvents({ from, to, status, band_id, limit, viewer } = {}) {
  const where = []
  const params = []
  if (from) { where.push('substr(e.starts_at, 1, 10) >= ?'); params.push(from) }
  if (to) { where.push('substr(e.starts_at, 1, 10) <= ?'); params.push(to) }
  if (status) { where.push('e.status = ?'); params.push(status) }
  if (band_id) { where.push('e.band_id = ?'); params.push(Number(band_id)) }
  if (viewer && viewer.role !== 'admin') { where.push('e.created_by = ?'); params.push(viewer.id) }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : ''
  const lim = limit ? ' LIMIT ' + Math.min(Number(limit), 2000) : ''
  return all(EVENT_SELECT + clause + ' ORDER BY e.starts_at ASC, e.id ASC' + lim, ...params)
}

export function saveEvent(data, id = null, createdBy = null, options = {}) {
  const band = data.band_id ? one('SELECT kind FROM bands WHERE id = ?', data.band_id) : null
  const role = band ? (band.kind === 'guest' ? 'guest' : 'leader') : (data.role || 'leader')
  const columns = {
    title: data.title,
    starts_at: data.starts_at,
    ends_at: data.ends_at ?? null,
    band_id: data.band_id ?? null,
    role,
    client_id: data.client_id ?? null,
    location_name: data.location_name ?? '',
    address: data.address ?? '',
    maps_url: data.maps_url ?? '',
    status: data.status || 'confirmed',
    musicians_planned: Number(data.musicians_planned) || 0,
    charged_amount: Number(data.charged_amount) || 0,
    advance_amount: Number(data.advance_amount) || 0,
    advance_account_id: data.advance_account_id ?? null,
    notes: data.notes ?? ''
  }
  const musicians = Array.isArray(data.musicians) ? data.musicians : []
  const manageTransaction = options.transaction !== false
  if (manageTransaction) db.exec('BEGIN')
  try {
    if (id) {
      const keys = Object.keys(columns)
      run(`UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        ...keys.map((k) => columns[k]), id)
      run('DELETE FROM event_musicians WHERE event_id = ?', id)
    } else {
      const keys = Object.keys(columns)
      const info = run(`INSERT INTO events (${keys.join(', ')}, created_by) VALUES (${keys.map(() => '?').join(', ')}, ?)`,
        ...keys.map((k) => columns[k]), createdBy)
      id = Number(info.lastInsertRowid)
    }
    for (const m of musicians) {
      run(`INSERT INTO event_musicians (event_id, musician_id, name, phone, payment_amount, paid)
           VALUES (?, ?, ?, ?, ?, ?)`,
        id, m.musician_id ?? null, String(m.name || '').trim(),
        m.phone || '', Number(m.payment_amount) || 0, m.paid ? 1 : 0)
    }
    if (manageTransaction) db.exec('COMMIT')
  } catch (err) {
    if (manageTransaction) db.exec('ROLLBACK')
    throw err
  }
  return getEvent(id)
}
