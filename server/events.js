import { all, one, run, db } from './db.js'
import { addHoursToStamp, normalizeTandas } from './datetime.js'
import { setting } from './settings.js'
import { findOrCreateMusician } from './musicians.js'

const OWN_COLOR = '#7c3aed'
const GUEST_COLOR = '#e11d48'

export function eventColors() {
  return {
    own: OWN_COLOR,
    guest: setting('guest_color', 'GUEST_EVENT_COLOR', GUEST_COLOR) || GUEST_COLOR
  }
}

function withColors(rows) {
  const colors = eventColors()
  return (rows || []).map((row) => row && {
    ...row,
    event_color: row.role === 'guest' ? colors.guest : (row.band_color || colors.own)
  })
}

export const EVENT_SELECT = `
  SELECT e.*, c.name AS client_name, c.phone AS client_phone,
         b.name AS band_name, b.kind AS band_kind, b.responsable AS band_responsable,
         b.color AS band_color, a.name AS advance_account_name,
         (SELECT COUNT(*) FROM event_musicians em WHERE em.event_id = e.id) AS musician_count,
         (SELECT COALESCE(SUM(em.payment_amount), 0) FROM event_musicians em WHERE em.event_id = e.id) AS musician_total,
         (SELECT COALESCE(SUM(em.payment_amount), 0) FROM event_musicians em WHERE em.event_id = e.id AND em.paid = 1) AS musician_paid,
         (SELECT COUNT(*) FROM event_invites ei WHERE ei.event_id = e.id) AS invite_count,
         (SELECT COUNT(*) FROM event_invites ei JOIN event_invite_responses ir ON ir.invite_id = ei.id
            WHERE ei.event_id = e.id AND ir.status = 'confirmed') AS invite_confirmed,
         (SELECT COUNT(*) FROM event_invites ei JOIN event_invite_responses ir ON ir.invite_id = ei.id
            WHERE ei.event_id = e.id AND ir.status = 'declined') AS invite_declined
  FROM events e
  LEFT JOIN clients c ON c.id = e.client_id
  LEFT JOIN bands b ON b.id = e.band_id
  LEFT JOIN accounts a ON a.id = e.advance_account_id
`

export const getEvent = (id) => withColors([one(EVENT_SELECT + ' WHERE e.id = ?', id)])[0]

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
  return withColors(all(EVENT_SELECT + clause + ' ORDER BY e.starts_at ASC, e.id ASC' + lim, ...params))
}

export function saveEvent(data, id = null, createdBy = null, options = {}) {
  const band = data.band_id
    ? (options.anyCatalogOwner
        ? one('SELECT kind FROM bands WHERE id = ?', data.band_id)
        : one('SELECT kind FROM bands WHERE id = ? AND created_by = ?', data.band_id, createdBy))
    : null
  const role = band ? (band.kind === 'guest' ? 'guest' : 'leader') : (data.role || 'leader')
  const tandas = normalizeTandas(data.tandas)
  const ratePerTanda = Number(data.rate_per_tanda) || 0
  const hasCharged = data.charged_amount !== undefined && data.charged_amount !== null && data.charged_amount !== ''
  const columns = {
    title: data.title,
    starts_at: data.starts_at,
    ends_at: tandas > 0 ? addHoursToStamp(data.starts_at, tandas) : (data.ends_at ?? null),
    tandas,
    rate_per_tanda: ratePerTanda,
    band_id: data.band_id ?? null,
    role,
    client_id: data.client_id ?? null,
    location_name: data.location_name ?? '',
    address: data.address ?? '',
    maps_url: data.maps_url ?? '',
    status: data.status || 'confirmed',
    musicians_planned: Number(data.musicians_planned) || 0,
    charged_amount: hasCharged ? (Number(data.charged_amount) || 0) : (ratePerTanda > 0 ? ratePerTanda * tandas : 0),
    advance_amount: Number(data.advance_amount) || 0,
    advance_account_id: data.advance_account_id ?? null,
    notes: data.notes ?? ''
  }
  const musicians = Array.isArray(data.musicians) ? data.musicians : []
  const catalogNew = data.catalog_new_musicians !== false
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
      const rate = Number(m.payment_per_tanda) || 0
      const hasPayment = m.payment_amount !== undefined && m.payment_amount !== null && m.payment_amount !== ''
      const payment = hasPayment ? (Number(m.payment_amount) || 0)
        : (rate > 0 && tandas > 0 ? rate * tandas : 0)
      let musicianId = m.musician_id ?? null
      if (!musicianId && catalogNew && String(m.name || '').trim()) {
        const catalogMusician = findOrCreateMusician({
          name: m.name, phone: m.phone, defaultPayment: payment > 0 ? payment : rate, createdBy
        })
        musicianId = catalogMusician ? Number(catalogMusician.id) : null
      }
      run(`INSERT INTO event_musicians (event_id, musician_id, name, phone, payment_per_tanda, payment_amount, paid)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, musicianId, String(m.name || '').trim(),
        m.phone || '', rate, payment, m.paid ? 1 : 0)
    }
    if (manageTransaction) db.exec('COMMIT')
  } catch (err) {
    if (manageTransaction) db.exec('ROLLBACK')
    throw err
  }
  return getEvent(id)
}
