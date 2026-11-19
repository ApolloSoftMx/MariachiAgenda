import { all, one, run } from './db.js'

// Normalización compartida entre el alta desde eventos y la confirmación de invitaciones.
export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('52') ? digits : '52' + digits
}

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

// Si el teléfono ya está en el catálogo se reutiliza ese músico (no se crea otro).
// El nombre es el respaldo para bases antiguas sin teléfono normalizado.
export function findOrCreateMusician({ name, phone, defaultPayment = 0, createdBy = null }) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 120)
  const digits = normalizePhone(phone)
  const catalog = all('SELECT * FROM musicians')
  const found = (digits ? catalog.find((m) => normalizePhone(m.phone) === digits) : null)
    || catalog.find((m) => normalizeName(m.name) === normalizeName(clean))
  if (found) return found
  const info = run(
    'INSERT INTO musicians (name, phone, default_payment, active, created_by) VALUES (?, ?, ?, 1, ?)',
    clean, digits, Number(defaultPayment) || 0, createdBy
  )
  return one('SELECT * FROM musicians WHERE id = ?', Number(info.lastInsertRowid))
}
