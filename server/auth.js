import crypto from 'node:crypto'

export const COOKIE = 'agenda_sid'
const SESSION_DAYS = 30

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  try {
    const [algo, saltHex, hashHex] = String(stored).split('$')
    if (algo !== 'scrypt' || !saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, 'hex')
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export const secureCookie = () => String(process.env.APP_URL || '').startsWith('https://')

export function createSession(db, res, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt)
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  })
}

export function destroySession(db, req, res) {
  const token = req.cookies?.[COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: secureCookie() })
}

export function loadUser(db, req) {
  const token = req.cookies?.[COOKIE]
  if (!token) return null
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
  `).get(token, Date.now())
  return row || null
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar' })
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Solo el super administrador puede hacer esto' })
  }
  next()
}

// Compatibilidad con llamadas antiguas.
export const requireOwner = requireAdmin

const todayLocal = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function subscriptionActive(db, user) {
  if (!user || user.role === 'admin') return true
  if (process.env.ENABLE_SUBSCRIPTIONS !== 'true') return true
  const sub = db.prepare('SELECT status, current_period_end FROM subscriptions WHERE user_id = ?').get(user.id)
  if (!sub || !['trialing', 'active'].includes(sub.status)) return false
  if (sub.current_period_end && sub.current_period_end < todayLocal()) return false
  return true
}

export function requireSubscription(db) {
  return (req, res, next) => {
    if (!subscriptionActive(db, req.user)) {
      return res.status(402).json({ error: 'Tu suscripción no está activa', code: 'SUBSCRIPTION_REQUIRED' })
    }
    next()
  }
}

export function publicUser(u) {
  if (!u) return null
  const { password_hash, telegram_link_code, telegram_chat_id, google_id, ...safe } = u
  return { ...safe, telegramLinked: Boolean(telegram_chat_id), googleLinked: Boolean(google_id) }
}
