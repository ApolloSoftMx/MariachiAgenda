import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { z } from 'zod'
import { all, one, run, db, dbPath } from './db.js'
import {
  createSession, destroySession, loadUser, requireAuth, requireAdmin, secureCookie,
  requireSubscription, subscriptionActive, publicUser, hashPassword, verifyPassword
} from './auth.js'
import { listBackups, createBackup, backupPath, removeBackup } from './backup.js'
import { quotePdf, statusLabel, mapsForQuote } from './pdf.js'
import { getEvent, listEvents, saveEvent, eventColors } from './events.js'
import { findOrCreateMusician, normalizePhone } from './musicians.js'
import { quoteEndStamp } from './datetime.js'
import { setting, getSetting, setSetting, deleteSetting, boolSetting } from './settings.js'
import { getBot, restartBot, notifyAdminsAboutRegistration } from './bot.js'

const nullableInt = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : Number(v)),
  z.number().int().nullable()
)
const money = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? 0 : Number(v)),
  z.number().finite()
)
const bool = z.preprocess((v) => v === true || v === 1 || v === '1' || v === 'true', z.boolean())
const tandasSchema = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? 0 : Math.round(Number(v))),
  z.number().int().min(0).max(48)
)

const zMusician = z.object({
  musician_id: nullableInt.optional().default(null),
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional().default(''),
  payment_per_tanda: money.optional().default(0),
  payment_amount: money.optional(),
  paid: bool.optional().default(false)
})

const zEvent = z.object({
  title: z.string().min(1).max(160),
  starts_at: z.string().min(10).max(30),
  ends_at: z.string().max(30).nullable().optional().default(null),
  band_id: nullableInt.optional().default(null),
  role: z.enum(['leader', 'guest']).optional().default('leader'),
  client_id: nullableInt.optional().default(null),
  location_name: z.string().max(200).optional().default(''),
  address: z.string().max(300).optional().default(''),
  maps_url: z.string().max(600).optional().default(''),
  status: z.enum(['confirmed', 'pending', 'cancelled']).optional().default('confirmed'),
  tandas: tandasSchema.optional().default(0),
  rate_per_tanda: money.optional().default(0),
  musicians_planned: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? 0 : Number(v)),
    z.number().int().min(0).max(200)
  ).optional().default(0),
  charged_amount: money.optional(),
  advance_amount: money.optional().default(0),
  advance_account_id: nullableInt.optional().default(null),
  notes: z.string().optional().default(''),
  catalog_new_musicians: bool.optional().default(true),
  musicians: z.array(zMusician).max(200, 'Máximo 200 músicos por evento').optional().default([])
})

const QUOTE_SELECT = `
  SELECT q.*, c.name AS client_name, c.phone AS client_phone,
         a.name AS account_name, a.details AS account_details
  FROM quotes q
  LEFT JOIN clients c ON c.id = q.client_id
  LEFT JOIN accounts a ON a.id = q.deposit_account_id
`

const idParam = (req) => Number(req.params.id)
const receiptsDir = path.join(
  path.dirname(dbPath),
  `${path.basename(dbPath, path.extname(dbPath))}-receipts`
)
fs.mkdirSync(receiptsDir, { recursive: true })

const receiptTypes = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
}
const receiptMagic = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 4).toString() === '%PDF'
}
const decodeHeader = (value, fallback) => {
  try { return decodeURIComponent(String(value || fallback)) } catch { return String(value || fallback) }
}

const canAccess = (user, row) => user?.role === 'admin' || Number(row?.created_by) === Number(user?.id)
const notFound = (res) => res.status(404).json({ error: 'No encontrado' })
const pad2 = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const loginAttempts = new Map()
const LOGIN_WINDOW = 10 * 60 * 1000
const LOGIN_MAX = 10

const OAUTH_COOKIE = 'agenda_oauth_state'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

function googleConfig(req) {
  const clientId = setting('google_client_id', 'GOOGLE_CLIENT_ID')
  const clientSecret = setting('google_client_secret', 'GOOGLE_CLIENT_SECRET')
  const fallbackBase = req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3000'
  const base = String(process.env.APP_URL || fallbackBase).replace(/\/$/, '')
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${base}/api/auth/google/callback`,
    enabled: Boolean(clientId && clientSecret)
  }
}

const authFail = (res, message) =>
  res.redirect('/?auth_error=' + encodeURIComponent(message))

const authNotice = (res, message) =>
  res.redirect('/?auth_notice=' + encodeURIComponent(message))

export function createApp(config = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.use('/api', (req, _res, next) => {
    req.user = loadUser(db, req)
    next()
  })

  const subGuard = requireSubscription(db)

  app.get('/api/config', (req, res) => {
    const google = googleConfig(req)
    res.json({
      appName: 'MariachiTotal',
      botUsername: setting('bot_username', 'BOT_USERNAME', config.botUsername || ''),
      botEnabled: Boolean(setting('bot_token', 'BOT_TOKEN', '')),
      subscriptionsEnabled: boolSetting('subscriptions_enabled', 'ENABLE_SUBSCRIPTIONS', false),
      registrationEnabled: boolSetting('allow_registration', 'ALLOW_REGISTRATION', true),
      googleEnabled: google.enabled,
      googleSignupEnabled: boolSetting('allow_google_signup', 'ALLOW_GOOGLE_SIGNUP', true),
      guestColor: eventColors().guest
    })
  })

  // ---------- auth ----------
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {}
    const key = String(req.ip || '') + '|' + String(email || '').toLowerCase()
    const now = Date.now()
    const attempt = loginAttempts.get(key)
    if (attempt && attempt.reset > now && attempt.count >= LOGIN_MAX) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' })
    }
    const user = one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', String(email || '').trim())
    if (!user || !verifyPassword(password, user.password_hash)) {
      const next = attempt && attempt.reset > now
        ? { count: attempt.count + 1, reset: attempt.reset }
        : { count: 1, reset: now + LOGIN_WINDOW }
      loginAttempts.set(key, next)
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' })
    }
    if (!user.active) {
      if (user.pending_approval) {
        return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación. El super administrador recibió tu solicitud.' })
      }
      return res.status(403).json({ error: 'Este usuario está desactivado' })
    }
    loginAttempts.delete(key)
    createSession(db, res, user.id)
    res.json({ user: publicUser(user), subscriptionActive: subscriptionActive(db, user) })
  })

  app.post('/api/auth/logout', (req, res) => {
    destroySession(db, req, res)
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    res.json({
      user: req.user ? publicUser(req.user) : null,
      subscriptionActive: req.user ? subscriptionActive(db, req.user) : false
    })
  })

  app.post('/api/auth/register', async (req, res) => {
    if (!boolSetting('allow_registration', 'ALLOW_REGISTRATION', true)) {
      return res.status(403).json({ error: 'El registro está desactivado; pide una cuenta al super administrador' })
    }
    const schema = z.object({
      name: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(6)
    })
    const parsed = schema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const existing = one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', parsed.data.email)
    if (existing) {
      if (existing.pending_approval) {
        return res.status(409).json({ error: 'Ya enviaste una solicitud con ese correo. Espera la aprobación del super administrador.' })
      }
      return res.status(409).json({ error: 'Ese correo ya está registrado' })
    }

    const info = run(
      'INSERT INTO users (name, email, password_hash, role, active, pending_approval) VALUES (?, ?, ?, ?, 0, 1)',
      parsed.data.name, parsed.data.email, hashPassword(parsed.data.password), 'user'
    )
    const user = one('SELECT * FROM users WHERE id = ?', Number(info.lastInsertRowid))
    run('INSERT INTO subscriptions (user_id, status) VALUES (?, ?)', user.id, 'trialing')

    notifyAdminsAboutRegistration(user, 'correo').catch((err) =>
      console.warn('[registro] no se pudo notificar al admin:', err.message))

    res.status(201).json({
      pending: true,
      message: 'Solicitud enviada. El super administrador debe aprobarla antes de que puedas entrar.'
    })
  })

  // ---------- Google OAuth ----------
  app.get('/api/auth/google', (req, res) => {
    const google = googleConfig()
    if (!google.enabled) return authFail(res, 'El acceso con Google no está configurado')
    const state = crypto.randomBytes(24).toString('hex')
    res.cookie(OAUTH_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(),
      maxAge: 10 * 60 * 1000,
      path: '/api/auth'
    })
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    })
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`)
  })

  app.get('/api/auth/google/callback', async (req, res) => {
    const google = googleConfig()
    const clearState = () => res.clearCookie(OAUTH_COOKIE, {
      httpOnly: true, sameSite: 'lax', secure: secureCookie(), path: '/api/auth'
    })
    if (!google.enabled) return authFail(res, 'El acceso con Google no está configurado')

    const { code, state, error } = req.query
    const expected = req.cookies?.[OAUTH_COOKIE]
    clearState()
    if (error) return authFail(res, 'Cancelaste el acceso con Google')
    if (!code || !state || !expected || String(state) !== String(expected)) {
      return authFail(res, 'La sesión de Google expiró. Inténtalo de nuevo.')
    }

    try {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: google.clientId,
          client_secret: google.clientSecret,
          redirect_uri: google.redirectUri,
          grant_type: 'authorization_code'
        })
      })
      if (!tokenRes.ok) {
        console.error('[google] token', tokenRes.status, await tokenRes.text())
        return authFail(res, 'No se pudo validar la cuenta de Google')
      }
      const tokens = await tokenRes.json()

      const infoRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
      if (!infoRes.ok) return authFail(res, 'No se pudo leer el perfil de Google')
      const profile = await infoRes.json()
      if (!profile.email || profile.email_verified === false) {
        return authFail(res, 'Tu correo de Google no está verificado')
      }

      const email = String(profile.email).trim()
      const googleId = String(profile.sub)
      let user = one('SELECT * FROM users WHERE google_id = ?', googleId)
      if (!user) user = one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email)

      if (user) {
        if (!user.active) {
          if (user.pending_approval) {
            return authNotice(res, 'Tu cuenta está pendiente de aprobación. El super administrador recibió tu solicitud.')
          }
          return authFail(res, 'Tu cuenta está desactivada. Contacta al super administrador.')
        }
        if (!user.google_id) {
          run('UPDATE users SET google_id = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
            googleId, profile.picture || null, user.id)
        }
      } else {
        if (!boolSetting('allow_google_signup', 'ALLOW_GOOGLE_SIGNUP', true)) {
          return authFail(res, 'No hay una cuenta con ese correo. Pide acceso al super administrador.')
        }
        const name = String(profile.name || email.split('@')[0]).slice(0, 80)
        const randomPassword = crypto.randomBytes(32).toString('hex')
        const info = run(
          `INSERT INTO users (name, email, password_hash, role, google_id, avatar_url, active, pending_approval)
           VALUES (?, ?, ?, 'user', ?, ?, 0, 1)`,
          name, email, hashPassword(randomPassword), googleId, profile.picture || null
        )
        user = one('SELECT * FROM users WHERE id = ?', Number(info.lastInsertRowid))
        run('INSERT INTO subscriptions (user_id, status) VALUES (?, ?)', user.id, 'trialing')
        notifyAdminsAboutRegistration(user, 'Google').catch((err) =>
          console.warn('[registro] no se pudo notificar al admin:', err.message))
        return authNotice(res, 'Solicitud enviada con Google. El super administrador debe aprobarla antes de que puedas entrar.')
      }

      createSession(db, res, user.id)
      res.redirect('/')
    } catch (err) {
      console.error('[google] callback', err)
      authFail(res, 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.')
    }
  })

  app.post('/api/auth/password', requireAuth, (req, res) => {
    const { current, next } = req.body || {}
    if (!verifyPassword(current, req.user.password_hash)) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' })
    }
    if (String(next || '').length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), req.user.id)
    res.json({ ok: true })
  })

  // ---------- users ----------
  app.get('/api/users', requireAuth, requireAdmin, (_req, res) => {
    res.json(all(`SELECT u.id, u.name, u.email, u.role, u.phone, u.active, u.pending_approval, u.created_at,
                         u.telegram_chat_id IS NOT NULL AS telegram_linked,
                         u.google_id IS NOT NULL AS google_linked,
                         s.status AS subscription_status, s.current_period_end
                  FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
                  ORDER BY u.pending_approval DESC, u.id`))
  })

  app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['admin', 'user']).default('user'),
      phone: z.string().max(40).optional().default('')
    })
    const parsed = schema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    if (one('SELECT id FROM users WHERE email = ? COLLATE NOCASE', parsed.data.email)) {
      return res.status(409).json({ error: 'Ese correo ya existe' })
    }
    const info = run('INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      parsed.data.name, parsed.data.email, hashPassword(parsed.data.password), parsed.data.role, parsed.data.phone)
    run('INSERT INTO subscriptions (user_id, status) VALUES (?, ?)', Number(info.lastInsertRowid), 'trialing')
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) })
  })

  app.patch('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const id = idParam(req)
    const target = one('SELECT * FROM users WHERE id = ?', id)
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(40).optional(),
      role: z.enum(['admin', 'user']).optional(),
      active: bool.optional(),
      password: z.string().min(6).optional()
    }).partial()
    const parsed = schema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })
    const d = parsed.data
    if (id === req.user.id && (d.role === 'user' || d.active === false)) {
      return res.status(400).json({ error: 'No puedes quitarte el acceso ni bajar tu propio rol' })
    }
    if (d.role === 'user' && target.role === 'admin') {
      const admins = one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n
      if (admins <= 1) return res.status(400).json({ error: 'Debe quedar al menos un super administrador activo' })
    }
    if (d.active === false && target.role === 'admin') {
      const admins = one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n
      if (admins <= 1) return res.status(400).json({ error: 'Debe quedar al menos un super administrador activo' })
    }
    if (d.email && d.email !== target.email) {
      if (one('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', d.email, id)) {
        return res.status(409).json({ error: 'Ese correo ya existe' })
      }
    }
    const fields = []
    const values = []
    for (const key of ['name', 'email', 'phone', 'role']) {
      if (d[key] !== undefined) { fields.push(`${key} = ?`); values.push(d[key]) }
    }
    if (d.active !== undefined) { fields.push('active = ?'); values.push(d.active ? 1 : 0) }
    if (d.password) { fields.push('password_hash = ?'); values.push(hashPassword(d.password)) }
    if (fields.length) run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...values, id)
    res.json({ ok: true })
  })

  app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
    const id = idParam(req)
    const target = one('SELECT id, name FROM users WHERE id = ?', id)
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })
    const password = crypto.randomBytes(9).toString('base64url')
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), id)
    res.json({ ok: true, password, message: `Contraseña temporal para ${target.name}` })
  })

  app.post('/api/admin/users/:id/authorize', requireAuth, requireAdmin, (req, res) => {
    const id = idParam(req)
    const target = one('SELECT id FROM users WHERE id = ?', id)
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })
    run('UPDATE users SET active = 1, pending_approval = 0 WHERE id = ?', id)
    if (one('SELECT user_id FROM subscriptions WHERE user_id = ?', id)) {
      run("UPDATE subscriptions SET status = 'active', current_period_end = NULL WHERE user_id = ?", id)
    } else {
      run("INSERT INTO subscriptions (user_id, status) VALUES (?, 'active')", id)
    }
    res.json({ ok: true })
  })

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const id = idParam(req)
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' })
    const target = one('SELECT * FROM users WHERE id = ?', id)
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (target.role === 'admin') {
      const admins = one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n
      if (admins <= 1) return res.status(400).json({ error: 'Debe quedar al menos un super administrador activo' })
    }
    run('UPDATE users SET active = 0 WHERE id = ?', id)
    res.json({ ok: true })
  })

  // ---------- solicitudes de registro ----------
  app.post('/api/admin/registrations/:id/approve', requireAuth, requireAdmin, (req, res) => {
    const target = one('SELECT * FROM users WHERE id = ?', idParam(req))
    if (!target) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (!target.pending_approval) return res.status(400).json({ error: 'Esta solicitud ya fue atendida' })
    run('UPDATE users SET active = 1, pending_approval = 0 WHERE id = ?', target.id)
    res.json({ ok: true })
  })

  app.post('/api/admin/registrations/:id/reject', requireAuth, requireAdmin, (req, res) => {
    const target = one('SELECT * FROM users WHERE id = ?', idParam(req))
    if (!target) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (!target.pending_approval) return res.status(400).json({ error: 'Esta solicitud ya fue atendida' })
    run('DELETE FROM subscriptions WHERE user_id = ?', target.id)
    run('DELETE FROM sessions WHERE user_id = ?', target.id)
    run('DELETE FROM users WHERE id = ?', target.id)
    res.json({ ok: true })
  })

  // ---------- super administrador: configuración, estado y respaldos ----------
  app.get('/api/admin/config', requireAuth, requireAdmin, (req, res) => {
    const google = googleConfig(req)
    res.json({
      botUsername: setting('bot_username', 'BOT_USERNAME', config.botUsername || ''),
      botTokenSet: Boolean(setting('bot_token', 'BOT_TOKEN', '')),
      botTokenFromEnv: Boolean(process.env.BOT_TOKEN),
      googleClientId: setting('google_client_id', 'GOOGLE_CLIENT_ID', ''),
      googleClientSecretSet: Boolean(setting('google_client_secret', 'GOOGLE_CLIENT_SECRET', '')),
      googleFromEnv: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      googleRedirectUri: google.redirectUri,
      allowRegistration: boolSetting('allow_registration', 'ALLOW_REGISTRATION', true),
      allowGoogleSignup: boolSetting('allow_google_signup', 'ALLOW_GOOGLE_SIGNUP', true),
      guestColor: eventColors().guest,
      appUrl: process.env.APP_URL || '',
      pendingCount: one('SELECT COUNT(*) AS n FROM users WHERE pending_approval = 1').n
    })
  })

  app.patch('/api/admin/config', requireAuth, requireAdmin, async (req, res) => {
    const schema = z.object({
      botToken: z.string().max(200).optional(),
      botUsername: z.string().max(80).optional(),
      googleClientId: z.string().max(300).optional(),
      googleClientSecret: z.string().max(300).optional(),
      allowRegistration: bool.optional(),
      allowGoogleSignup: bool.optional(),
      guestColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional(),
      clearBotToken: bool.optional(),
      clearGoogle: bool.optional()
    })
    const parsed = schema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })
    const d = parsed.data
    let restart = false

    if (d.clearBotToken) {
      deleteSetting('bot_token')
      restart = true
    } else if (d.botToken !== undefined && d.botToken.trim()) {
      setSetting('bot_token', d.botToken.trim())
      restart = true
    }
    if (d.botUsername !== undefined) {
      const value = d.botUsername.trim().replace(/^@/, '')
      if (value) setSetting('bot_username', value)
      else deleteSetting('bot_username')
    }

    if (d.clearGoogle) {
      deleteSetting('google_client_id')
      deleteSetting('google_client_secret')
    } else {
      if (d.googleClientId !== undefined) {
        const value = d.googleClientId.trim()
        if (value) setSetting('google_client_id', value)
        else deleteSetting('google_client_id')
      }
      if (d.googleClientSecret !== undefined && d.googleClientSecret.trim()) {
        setSetting('google_client_secret', d.googleClientSecret.trim())
      }
    }

    if (d.allowRegistration !== undefined) {
      setSetting('allow_registration', d.allowRegistration ? 'true' : 'false')
    }
    if (d.allowGoogleSignup !== undefined) {
      setSetting('allow_google_signup', d.allowGoogleSignup ? 'true' : 'false')
    }
    if (d.guestColor !== undefined) setSetting('guest_color', d.guestColor)

    if (restart) {
      try {
        await restartBot()
      } catch (err) {
        console.warn('[config] no se pudo reiniciar el bot:', err.message)
      }
    }

    res.json({ ok: true })
  })

  app.get('/api/admin/status', requireAuth, requireAdmin, (req, res) => {
    res.json({
      botConfigured: Boolean(setting('bot_token', 'BOT_TOKEN', '')),
      botUsername: setting('bot_username', 'BOT_USERNAME', config.botUsername || ''),
      googleEnabled: googleConfig(req).enabled,
      registrationEnabled: boolSetting('allow_registration', 'ALLOW_REGISTRATION', true),
      guestColor: eventColors().guest,
      appUrl: process.env.APP_URL || '',
      node: process.version,
      dbPath: process.env.DB_PATH || './data/agenda.db',
      backupCount: listBackups().length,
      pendingCount: one('SELECT COUNT(*) AS n FROM users WHERE pending_approval = 1').n
    })
  })

  app.get('/api/admin/backups', requireAuth, requireAdmin, (_req, res) => {
    res.json(listBackups())
  })

  app.post('/api/admin/backups', requireAuth, requireAdmin, (_req, res) => {
    try {
      res.status(201).json(createBackup())
    } catch (err) {
      console.error('[backup]', err)
      res.status(500).json({ error: 'No se pudo crear el respaldo' })
    }
  })

  app.get('/api/admin/backups/:name', requireAuth, requireAdmin, (req, res) => {
    const file = backupPath(req.params.name)
    if (!file) return res.status(404).json({ error: 'Respaldo no encontrado' })
    res.download(file, req.params.name)
  })

  app.delete('/api/admin/backups/:name', requireAuth, requireAdmin, (req, res) => {
    if (!removeBackup(req.params.name)) return res.status(404).json({ error: 'Respaldo no encontrado' })
    res.json({ ok: true })
  })

  // ---------- telegram ----------
  app.post('/api/telegram/link', requireAuth, (req, res) => {
    const code = cryptoRandomCode()
    run('UPDATE users SET telegram_link_code = ? WHERE id = ?', code, req.user.id)
    res.json({ code, botUsername: setting('bot_username', 'BOT_USERNAME', config.botUsername || '') })
  })

  app.delete('/api/telegram/unlink', requireAuth, (req, res) => {
    run('UPDATE users SET telegram_chat_id = NULL, telegram_link_code = NULL WHERE id = ?', req.user.id)
    res.json({ ok: true })
  })

  // ---------- bands ----------
  app.get('/api/bands', requireAuth, subGuard, (_req, res) => {
    res.json(all('SELECT * FROM bands ORDER BY kind, name'))
  })

  app.post('/api/bands', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(100),
      kind: z.enum(['own', 'guest']).default('own'),
      responsable: z.string().max(100).optional().default(''),
      color: z.string().max(20).optional().default('#7c3aed')
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const info = run('INSERT INTO bands (name, kind, responsable, color, created_by) VALUES (?, ?, ?, ?, ?)',
      p.data.name, p.data.kind, p.data.responsable, p.data.color, req.user.id)
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) })
  })

  app.patch('/api/bands/:id', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(100).optional(),
      kind: z.enum(['own', 'guest']).optional(),
      responsable: z.string().max(100).optional(),
      color: z.string().max(20).optional(),
      active: bool.optional()
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const fields = []
    const values = []
    for (const k of ['name', 'kind', 'responsable', 'color']) {
      if (p.data[k] !== undefined) { fields.push(`${k} = ?`); values.push(p.data[k]) }
    }
    if (p.data.active !== undefined) { fields.push('active = ?'); values.push(p.data.active ? 1 : 0) }
    if (fields.length) run(`UPDATE bands SET ${fields.join(', ')} WHERE id = ?`, ...values, idParam(req))
    res.json({ ok: true })
  })

  app.delete('/api/bands/:id', requireAuth, subGuard, (req, res) => {
    run('UPDATE bands SET active = 0 WHERE id = ?', idParam(req))
    res.json({ ok: true })
  })

  // ---------- clients ----------
  app.get('/api/clients', requireAuth, subGuard, (_req, res) => {
    res.json(all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM events e WHERE e.client_id = c.id) AS event_count,
        (SELECT COALESCE(SUM(e.charged_amount),0) FROM events e WHERE e.client_id = c.id AND e.status <> 'cancelled') AS total_charged
      FROM clients c ORDER BY c.name COLLATE NOCASE`))
  })

  app.post('/api/clients', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(120),
      phone: z.string().max(40).optional().default(''),
      notes: z.string().optional().default('')
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const info = run('INSERT INTO clients (name, phone, notes, created_by) VALUES (?, ?, ?, ?)',
      p.data.name, p.data.phone, p.data.notes, req.user.id)
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) })
  })

  app.patch('/api/clients/:id', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(120).optional(),
      phone: z.string().max(40).optional(),
      notes: z.string().optional()
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const fields = Object.keys(p.data).filter((k) => p.data[k] !== undefined)
    if (fields.length) run(`UPDATE clients SET ${fields.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...fields.map((k) => p.data[k]), idParam(req))
    res.json({ ok: true })
  })

  app.delete('/api/clients/:id', requireAuth, subGuard, (req, res) => {
    run('DELETE FROM clients WHERE id = ?', idParam(req))
    res.json({ ok: true })
  })

  // ---------- accounts ----------
  app.get('/api/accounts', requireAuth, subGuard, (_req, res) => {
    res.json(all('SELECT * FROM accounts ORDER BY name'))
  })

  app.post('/api/accounts', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['bank', 'cash', 'other']).default('bank'),
      details: z.string().max(200).optional().default('')
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const info = run('INSERT INTO accounts (name, type, details) VALUES (?, ?, ?)',
      p.data.name, p.data.type, p.data.details)
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) })
  })

  app.patch('/api/accounts/:id', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(100).optional(),
      type: z.enum(['bank', 'cash', 'other']).optional(),
      details: z.string().max(200).optional(),
      active: bool.optional()
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const fields = []
    const values = []
    for (const k of ['name', 'type', 'details']) {
      if (p.data[k] !== undefined) { fields.push(`${k} = ?`); values.push(p.data[k]) }
    }
    if (p.data.active !== undefined) { fields.push('active = ?'); values.push(p.data.active ? 1 : 0) }
    if (fields.length) run(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, ...values, idParam(req))
    res.json({ ok: true })
  })

  app.delete('/api/accounts/:id', requireAuth, subGuard, (req, res) => {
    run('DELETE FROM accounts WHERE id = ?', idParam(req))
    res.json({ ok: true })
  })

  // ---------- cotizaciones ----------
  const zQuote = z.object({
    client_id: nullableInt.optional().default(null),
    title: z.string().min(1).max(160),
    event_date: z.string().max(30).optional().default(''),
    event_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida').optional().default('19:00'),
    location_name: z.string().max(200).optional().default(''),
    address: z.string().max(300).optional().default(''),
    maps_url: z.string().max(600).optional().default(''),
    description: z.string().optional().default(''),
    tandas: tandasSchema.optional().default(0),
    rate_per_tanda: money.optional().default(0),
    musicians_planned: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? 0 : Number(v)),
      z.number().int().min(0).max(200)
    ).optional().default(0),
    amount: money.optional().default(0),
    deposit_amount: money.optional().default(0),
    valid_until: z.string().max(30).optional().default(''),
    status: z.enum(['draft', 'sent', 'accepted', 'rejected']).optional().default('draft'),
    deposit_account_id: nullableInt.optional().default(null),
    deposit_details: z.string().max(600).optional().default(''),
    notes: z.string().optional().default('')
  })

  const getQuote = (id) => one(QUOTE_SELECT + ' WHERE q.id = ?', id)
  const getQuoteByToken = (token) => one(QUOTE_SELECT + ' WHERE q.share_token = ?', token)
  const sendQuotePdf = (res, quote, name) => {
    res.type('application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`)
    res.send(quotePdf(quote))
  }

  const publicBase = (req) =>
    String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')

  const waNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return null
    return digits.startsWith('52') ? digits : '52' + digits
  }

  const buildQuoteShare = (quote, req) => {
    const publicUrl = `${publicBase(req)}/q/${quote.share_token}`
    const pdfUrl = `${publicUrl}.pdf`
    const deposit = [quote.account_name, quote.account_details, quote.deposit_details]
      .filter(Boolean).join('\n')
    const place = [quote.location_name, quote.address].filter(Boolean).join(' — ')
    const maps = mapsForQuote(quote)
    const message = [
      `Hola${quote.client_name ? ` ${quote.client_name.split(' ')[0]}` : ''} 👋`,
      `Te comparto la cotización «${quote.title}».`,
      quote.event_date ? `Fecha del evento: ${quote.event_date}.` : '',
      quote.tandas > 0 ? `Tandas: ${quote.tandas} (${quote.tandas} hora${quote.tandas === 1 ? '' : 's'}). Termina: ${quoteEndStamp(quote)}.` : '',
      Number(quote.rate_per_tanda) > 0 ? `Pago por tanda: $${Number(quote.rate_per_tanda).toFixed(2)}.` : '',
      place ? `Lugar: ${place}.` : '',
      maps ? `Ubicación en Maps: ${maps}` : '',
      `Total: $${Number(quote.amount || 0).toFixed(2)}`,
      Number(quote.deposit_amount) > 0 ? `Depósito: $${Number(quote.deposit_amount).toFixed(2)}` : '',
      deposit ? `Datos para depósito:\n${deposit}` : '',
      quote.valid_until ? `Vigencia: ${quote.valid_until}.` : '',
      `Puedes verla aquí: ${publicUrl}`,
      `PDF: ${pdfUrl}`
    ].filter(Boolean).join('\n')
    const phone = waNumber(quote.client_phone)
    return {
      publicUrl,
      pdfUrl,
      mapsUrl: maps,
      receiptUrl: quote.receipt_path ? `${publicUrl}/receipt` : '',
      eventId: quote.event_id || null,
      message,
      whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
      clientPhone: quote.client_phone || ''
    }
  }

  app.get('/api/quotes', requireAuth, subGuard, (req, res) => {
    const where = []
    const params = []
    if (req.query.client_id) { where.push('q.client_id = ?'); params.push(Number(req.query.client_id)) }
    if (req.query.status) { where.push('q.status = ?'); params.push(req.query.status) }
    if (req.query.search) {
      where.push('(q.title LIKE ? OR c.name LIKE ?)')
      const like = '%' + String(req.query.search) + '%'
      params.push(like, like)
    }
    if (req.user.role !== 'admin') { where.push('q.created_by = ?'); params.push(req.user.id) }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : ''
    res.json(all(QUOTE_SELECT + clause + ' ORDER BY q.created_at DESC, q.id DESC', ...params))
  })

  app.get('/api/quotes/:id', requireAuth, subGuard, (req, res) => {
    const quote = getQuote(idParam(req))
    if (!quote || !canAccess(req.user, quote)) return notFound(res)
    res.json(quote)
  })

  app.post('/api/quotes', requireAuth, subGuard, (req, res) => {
    const raw = req.body || {}
    const parsed = zQuote.safeParse(raw)
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    const d = parsed.data
    if ((raw.amount === undefined || raw.amount === null || raw.amount === '')
      && d.rate_per_tanda > 0 && d.tandas > 0) {
      d.amount = Number((d.rate_per_tanda * d.tandas).toFixed(2))
    }
    const token = crypto.randomBytes(12).toString('hex')
    const info = run(`INSERT INTO quotes
      (client_id, title, event_date, event_time, location_name, address, maps_url, description,
       tandas, rate_per_tanda, musicians_planned, amount, deposit_amount, valid_until, status, deposit_account_id,
       deposit_details, notes, share_token, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.client_id, d.title, d.event_date, d.event_time, d.location_name, d.address, d.maps_url,
      d.description, d.tandas, d.rate_per_tanda, d.musicians_planned, d.amount, d.deposit_amount, d.valid_until, d.status,
      d.deposit_account_id, d.deposit_details, d.notes, token, req.user.id)
    res.status(201).json(getQuote(Number(info.lastInsertRowid)))
  })

  app.patch('/api/quotes/:id', requireAuth, subGuard, (req, res) => {
    const quote = getQuote(idParam(req))
    if (!quote || !canAccess(req.user, quote)) return notFound(res)
    const raw = req.body || {}
    const parsed = zQuote.partial().safeParse(raw)
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })
    const d = parsed.data
    if (raw.amount === undefined && (raw.rate_per_tanda !== undefined || raw.tandas !== undefined)) {
      const rate = d.rate_per_tanda ?? quote.rate_per_tanda
      const tandas = d.tandas ?? quote.tandas
      if (rate > 0 && tandas > 0) d.amount = Number((rate * tandas).toFixed(2))
    }
    const fields = []
    const values = []
    for (const key of ['client_id', 'title', 'event_date', 'event_time', 'location_name',
      'address', 'maps_url', 'description', 'tandas', 'rate_per_tanda', 'musicians_planned', 'amount', 'deposit_amount',
      'valid_until', 'status', 'deposit_account_id', 'deposit_details', 'notes']) {
      if (d[key] !== undefined) { fields.push(`${key} = ?`); values.push(d[key]) }
    }
    if (fields.length) {
      fields.push("updated_at = datetime('now')")
      run(`UPDATE quotes SET ${fields.join(', ')} WHERE id = ?`, ...values, quote.id)
    }
    res.json(getQuote(quote.id))
  })

  app.delete('/api/quotes/:id', requireAuth, subGuard, (req, res) => {
    const quote = getQuote(idParam(req))
    if (!quote || !canAccess(req.user, quote)) return notFound(res)
    if (quote.receipt_path) {
      fs.rmSync(path.join(receiptsDir, quote.receipt_path), { force: true })
    }
    run('DELETE FROM quotes WHERE id = ?', quote.id)
    res.json({ ok: true })
  })

  app.get('/api/quotes/:id/pdf', requireAuth, subGuard, (req, res) => {
    const quote = getQuote(idParam(req))
    if (!quote || !canAccess(req.user, quote)) return notFound(res)
    sendQuotePdf(res, quote, `cotizacion-${quote.id}`)
  })

  app.get('/api/quotes/:id/share', requireAuth, subGuard, (req, res) => {
    const quote = getQuote(idParam(req))
    if (!quote || !canAccess(req.user, quote)) return notFound(res)
    res.json(buildQuoteShare(quote, req))
  })

  // Enlace público con token: el cliente ve la cotización sin iniciar sesión.
  app.get('/api/public/quotes/:token', (req, res) => {
    const quote = getQuoteByToken(req.params.token)
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' })
    res.json({ ...quote, status_label: statusLabel(quote.status) })
  })

  app.get('/api/public/quotes/:token/pdf', (req, res) => {
    const quote = getQuoteByToken(req.params.token)
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' })
    sendQuotePdf(res, quote, `cotizacion-${quote.id}`)
  })

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  app.get('/q/:token.pdf', (req, res) => {
    const quote = getQuoteByToken(req.params.token)
    if (!quote) return res.status(404).type('text/plain').send('Cotización no encontrada')
    sendQuotePdf(res, quote, `cotizacion-${quote.id}`)
  })

  app.post('/q/:token/accept', express.raw({ type: Object.keys(receiptTypes), limit: '10mb' }), (req, res) => {
    const quote = getQuoteByToken(req.params.token)
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' })
    if (quote.status === 'rejected') {
      return res.status(409).json({ error: 'Esta cotización ya fue rechazada. Pide una nueva al encargado.' })
    }
    if (quote.event_id || quote.accepted_at || quote.receipt_path) {
      return res.status(409).json({ error: 'Esta cotización ya fue aceptada y agendada.' })
    }
    if (!quote.event_date) {
      return res.status(400).json({ error: 'Esta cotización aún no tiene fecha. Pide al encargado que la complete.' })
    }

    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    const ext = receiptTypes[mime]
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!ext || !body.length || !receiptMagic[mime]?.(body)) {
      return res.status(400).json({ error: 'Adjunta un comprobante válido: imagen PNG, JPG, WebP o PDF (máximo 10 MB).' })
    }

    const originalName = decodeHeader(req.headers['x-file-name'], 'comprobante')
      .replace(/[^\w.\- ()]/g, '_').slice(0, 160) || 'comprobante'
    const fileName = `${quote.share_token}-${Date.now()}.${ext}`
    const filePath = path.join(receiptsDir, fileName)
    const startsAt = `${quote.event_date}T${quote.event_time || '19:00'}`

    db.exec('BEGIN')
    try {
      fs.writeFileSync(filePath, body)
      const event = saveEvent({
        title: quote.title,
        starts_at: startsAt,
        band_id: null,
        role: 'leader',
        client_id: quote.client_id,
        location_name: quote.location_name,
        address: quote.address,
        maps_url: quote.maps_url,
        status: 'confirmed',
        tandas: quote.tandas,
        rate_per_tanda: quote.rate_per_tanda,
        musicians_planned: quote.musicians_planned,
        charged_amount: quote.amount,
        advance_amount: quote.deposit_amount,
        advance_account_id: quote.deposit_account_id,
        notes: `Cotización aceptada desde enlace público. Comprobante de depósito: ${originalName}.`
      }, null, quote.created_by, { transaction: false })
      run(`UPDATE quotes SET status = 'accepted', accepted_at = datetime('now'),
           receipt_name = ?, receipt_mime = ?, receipt_path = ?, event_id = ?
           WHERE id = ?`, originalName, mime, fileName, event.id, quote.id)
      db.exec('COMMIT')
      res.json({
        ok: true,
        eventId: event.id,
        receiptUrl: `/q/${encodeURIComponent(quote.share_token)}/receipt`
      })
    } catch (err) {
      db.exec('ROLLBACK')
      fs.rmSync(filePath, { force: true })
      console.error('[quote accept]', err)
      res.status(500).json({ error: 'No se pudo aceptar la cotización. Inténtalo de nuevo.' })
    }
  })

  app.get('/q/:token/receipt', (req, res) => {
    const quote = getQuoteByToken(req.params.token)
    if (!quote || !quote.receipt_path) return res.status(404).type('text/plain').send('Comprobante no encontrado')
    const filePath = path.join(receiptsDir, quote.receipt_path)
    if (!fs.existsSync(filePath)) return res.status(404).type('text/plain').send('Comprobante no encontrado')
    res.type(quote.receipt_mime || 'application/octet-stream')
    res.setHeader('Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(quote.receipt_name || 'comprobante')}`)
    res.send(fs.readFileSync(filePath))
  })

  app.get('/q/:token', (req, res) => {
    const quote = getQuoteByToken(req.params.token)
    if (!quote) return res.status(404).type('text/plain').send('Cotización no encontrada')
    const maps = mapsForQuote(quote)
    const place = [quote.location_name, quote.address].filter(Boolean).join(' — ')
    const row = (label, value) => value
      ? `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>` : ''
    const tokenJs = JSON.stringify(quote.share_token)
    const accepted = Boolean(quote.event_id || quote.accepted_at || quote.receipt_path)
    const acceptBlock = accepted
      ? `<div class="accept done"><strong>✅ Cotización aceptada y agendada</strong>
           <p>Gracias. Ya registramos tu evento en la agenda.</p>
           ${quote.receipt_path ? `<a class="btn" href="/q/${encodeURIComponent(quote.share_token)}/receipt" target="_blank" rel="noreferrer">Ver mi comprobante</a>` : ''}
         </div>`
      : quote.status === 'rejected'
        ? `<div class="accept"><strong>Esta cotización ya no está disponible.</strong></div>`
        : `<div class="accept">
             <h2>Aceptar cotización</h2>
             <p>Adjunta tu comprobante de depósito. Al enviarlo, la cotización se marca como aceptada y el evento se agenda automáticamente.</p>
             <form id="accept-form">
               <input type="file" name="receipt" accept="image/png,image/jpeg,image/webp,application/pdf" required>
               <button class="btn" type="submit">Adjuntar comprobante y aceptar</button>
             </form>
             <p class="error" id="accept-error" role="alert"></p>
             <small>PNG, JPG, WebP o PDF · máximo 10 MB</small>
           </div>
           <script>
           document.getElementById('accept-form').addEventListener('submit', async (e) => {
             e.preventDefault()
             const form = e.currentTarget
             const file = form.receipt.files[0]
             const error = document.getElementById('accept-error')
             const button = form.querySelector('button')
             error.textContent = ''
             if (!file) { error.textContent = 'Selecciona tu comprobante.'; return }
             button.disabled = true
             button.textContent = 'Enviando…'
             try {
               const res = await fetch('/q/' + ${tokenJs} + '/accept', {
                 method: 'POST',
                 headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) },
                 body: file
               })
               const data = await res.json().catch(() => ({}))
               if (!res.ok) throw new Error(data.error || 'No se pudo enviar el comprobante.')
               location.reload()
             } catch (err) {
               error.textContent = err.message
               button.disabled = false
               button.textContent = 'Adjuntar comprobante y aceptar'
             }
           })
           </script>`
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotización · ${escapeHtml(quote.title)}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f6fb;color:#1f2430;padding:20px}
.card{max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(55,30,100,.14)}
.head{background:#6d28d9;color:#ffffff;padding:22px}.head small{opacity:.75;letter-spacing:.12em}
.body{padding:22px}h1{font-size:1.35rem;margin:8px 0 18px}.row{display:flex;gap:12px;justify-content:space-between;border-bottom:1px solid #e8e5f0;padding:10px 0}
.row span{color:#6b7280}.row strong{text-align:right}.total{font-size:1.35rem;color:#6d28d9}
.block{margin-top:18px;white-space:pre-wrap;line-height:1.5}.btn{display:inline-block;margin-top:22px;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;border:0;cursor:pointer;font-family:inherit;font-size:1rem}
.accept{margin-top:28px;padding:18px;border-radius:14px;background:#f4edff;border:1px solid #e8e5f0}
.accept.done{background:#d5f0df;border-color:#e8e5f0}
.accept h2{margin:0 0 8px;font-size:1.05rem;color:#6d28d9}
.accept p{margin:6px 0 14px;color:#6b7280;font-size:.92rem}
.accept form{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.accept input{max-width:100%;font-family:inherit}
.accept .btn{margin-top:0}
.error{color:#b52038!important;font-weight:600}
</style></head><body><div class="card"><div class="head"><small>MARIACHITOTAL</small><h1>Cotización</h1></div><div class="body">
<h1>${escapeHtml(quote.title)}</h1>
${row('Cliente', quote.client_name)}
${row('Teléfono', quote.client_phone)}
${row('Fecha del evento', quote.event_date)}
${row('Hora', quote.event_time || '19:00')}
${Number(quote.tandas) > 0 ? row('Tandas', `${quote.tandas} (${quote.tandas} hora${quote.tandas === 1 ? '' : 's'})`) : ''}
${Number(quote.tandas) > 0 ? row('Fin estimado', quoteEndStamp(quote)) : ''}
${Number(quote.rate_per_tanda) > 0 ? row('Pago por tanda', `$${Number(quote.rate_per_tanda).toFixed(2)}`) : ''}
${row('Vigencia', quote.valid_until)}
${row('Músicos planeados', quote.musicians_planned)}
${Number(quote.deposit_amount) > 0 ? row('Depósito', `$${Number(quote.deposit_amount).toFixed(2)}`) : ''}
${row('Ubicación', place)}
${maps ? `<div class="row"><span>Maps</span><a href="${escapeHtml(maps)}" target="_blank" rel="noreferrer">Abrir ubicación</a></div>` : ''}
${row('Estatus', statusLabel(quote.status))}
<div class="row total"><span>Total</span><strong>$${Number(quote.amount || 0).toFixed(2)}</strong></div>
${quote.description ? `<div class="block"><strong>Descripción</strong><br>${escapeHtml(quote.description)}</div>` : ''}
${quote.notes ? `<div class="block"><strong>Notas</strong><br>${escapeHtml(quote.notes)}</div>` : ''}
${quote.account_name || quote.account_details || quote.deposit_details
    ? `<div class="block"><strong>Datos para depósito</strong><br>${escapeHtml([quote.account_name, quote.account_details, quote.deposit_details].filter(Boolean).join('\n'))}</div>` : ''}
<a class="btn" href="/q/${encodeURIComponent(quote.share_token)}.pdf">Descargar PDF</a>
${acceptBlock}
</div></div></body></html>`)
  })

  // ---------- musicians ----------
  app.get('/api/musicians', requireAuth, subGuard, (_req, res) => {
    res.json(all(`
      SELECT m.*, (SELECT COUNT(*) FROM event_musicians em WHERE em.musician_id = m.id) AS event_count
      FROM musicians m ORDER BY m.name COLLATE NOCASE`))
  })

  app.post('/api/musicians', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(120),
      phone: z.string().max(40).optional().default(''),
      default_payment: money.optional().default(0)
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const info = run('INSERT INTO musicians (name, phone, default_payment, created_by) VALUES (?, ?, ?, ?)',
      p.data.name, p.data.phone, p.data.default_payment, req.user.id)
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) })
  })

  app.patch('/api/musicians/:id', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      name: z.string().min(1).max(120).optional(),
      phone: z.string().max(40).optional(),
      default_payment: money.optional(),
      active: bool.optional()
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    const fields = []
    const values = []
    for (const k of ['name', 'phone', 'default_payment']) {
      if (p.data[k] !== undefined) { fields.push(`${k} = ?`); values.push(p.data[k]) }
    }
    if (p.data.active !== undefined) { fields.push('active = ?'); values.push(p.data.active ? 1 : 0) }
    if (fields.length) run(`UPDATE musicians SET ${fields.join(', ')} WHERE id = ?`, ...values, idParam(req))
    res.json({ ok: true })
  })

  app.delete('/api/musicians/:id', requireAuth, subGuard, (req, res) => {
    run('DELETE FROM musicians WHERE id = ?', idParam(req))
    res.json({ ok: true })
  })

  // ---------- events ----------
  app.get('/api/events', requireAuth, subGuard, (req, res) => {
    res.json(listEvents({ ...req.query, viewer: req.user }))
  })

  app.get('/api/events/:id', requireAuth, subGuard, (req, res) => {
    const event = getEvent(idParam(req))
    if (!event || !canAccess(req.user, event)) return notFound(res)
    res.json({
      ...event,
      musicians: all('SELECT * FROM event_musicians WHERE event_id = ? ORDER BY id', event.id),
      expenses: all('SELECT * FROM expenses WHERE event_id = ? ORDER BY date', event.id)
    })
  })

  app.post('/api/events', requireAuth, subGuard, (req, res) => {
    const parsed = zEvent.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      const event = saveEvent(parsed.data, null, req.user.id)
      res.status(201).json(event)
    } catch (err) {
      console.error('[event create]', err)
      res.status(500).json({ error: 'No se pudo guardar el evento' })
    }
  })

  app.patch('/api/events/:id', requireAuth, subGuard, (req, res) => {
    const existing = one('SELECT * FROM events WHERE id = ?', idParam(req))
    if (!existing || !canAccess(req.user, existing)) return notFound(res)
    const musicians = req.body?.musicians !== undefined
      ? req.body.musicians
      : all('SELECT musician_id, name, phone, payment_per_tanda, payment_amount, paid FROM event_musicians WHERE event_id = ?', existing.id)
    const merged = {
      ...existing,
      ...req.body,
      musicians,
      band_id: req.body?.band_id !== undefined ? req.body.band_id : existing.band_id,
      client_id: req.body?.client_id !== undefined ? req.body.client_id : existing.client_id,
      advance_account_id: req.body?.advance_account_id !== undefined
        ? req.body.advance_account_id : existing.advance_account_id
    }
    const parsed = zEvent.safeParse(merged)
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      res.json(saveEvent(parsed.data, existing.id, req.user.id))
    } catch (err) {
      console.error('[event update]', err)
      res.status(500).json({ error: 'No se pudo actualizar el evento' })
    }
  })

  app.delete('/api/events/:id', requireAuth, subGuard, (req, res) => {
    const existing = one('SELECT * FROM events WHERE id = ?', idParam(req))
    if (!existing || !canAccess(req.user, existing)) return notFound(res)
    run('DELETE FROM events WHERE id = ?', existing.id)
    res.json({ ok: true })
  })

  // ---------- invitaciones públicas a eventos ----------
  const inviteRate = money.refine(
    (n) => n >= 0 && n <= 100000,
    'El pago por tanda debe estar entre 0 y 100000'
  )
  const zInviteResponse = z.object({
    name: z.string().trim().min(2, 'Escribe tu nombre').max(120),
    status: z.enum(['confirmed', 'declined'])
  })
  const getInvite = (token) => one(`
    SELECT ei.*, e.title, e.starts_at, e.ends_at, e.tandas, e.location_name, e.address,
           e.maps_url, e.notes, b.name AS band_name
    FROM event_invites ei
    JOIN events e ON e.id = ei.event_id
    LEFT JOIN bands b ON b.id = e.band_id
    WHERE ei.token = ?`, token)
  const fmtEventStamp = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''))
    if (!match) return String(value || '')
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
    const text = new Intl.DateTimeFormat('es-MX', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date)
    return /[.!?]$/.test(text) ? text : `${text}.`
  }

  app.post('/api/events/:id/invites', requireAuth, subGuard, (req, res) => {
    const existing = one('SELECT * FROM events WHERE id = ?', idParam(req))
    if (!existing || !canAccess(req.user, existing)) return notFound(res)
    const parsed = z.object({ rate_per_tanda: inviteRate.optional().default(0) })
      .safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    const token = crypto.randomBytes(18).toString('hex')
    const info = run(
      'INSERT INTO event_invites (event_id, token, rate_per_tanda, created_by) VALUES (?, ?, ?, ?)',
      existing.id, token, parsed.data.rate_per_tanda, req.user.id
    )
    res.status(201).json({
      id: Number(info.lastInsertRowid), token, rate_per_tanda: parsed.data.rate_per_tanda,
      publicUrl: `${publicBase(req)}/e/${token}`
    })
  })

  app.get('/api/events/:id/invites', requireAuth, subGuard, (req, res) => {
    const existing = one('SELECT * FROM events WHERE id = ?', idParam(req))
    if (!existing || !canAccess(req.user, existing)) return notFound(res)
    const invites = all('SELECT * FROM event_invites WHERE event_id = ? ORDER BY created_at DESC, id DESC', existing.id)
    const responses = all(`SELECT ir.*, ei.token AS invite_token, ei.rate_per_tanda AS invite_rate_per_tanda,
        em.payment_per_tanda, em.payment_amount, em.paid
      FROM event_invite_responses ir JOIN event_invites ei ON ei.id = ir.invite_id
      LEFT JOIN event_musicians em ON em.id = ir.event_musician_id
      WHERE ei.event_id = ? ORDER BY ir.updated_at DESC, ir.id DESC`, existing.id)
    res.json(invites.map((invite) => ({
      ...invite,
      responses: responses.filter((r) => r.invite_id === invite.id)
    })))
  })

  app.get('/e/:token', (req, res) => {
    const invite = getInvite(req.params.token)
    if (!invite) return res.status(404).type('text/plain').send('Invitación no encontrada')
    const maps = invite.maps_url || (invite.address || invite.location_name
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(invite.address || invite.location_name)}`
      : '')
    const place = [invite.location_name, invite.address].filter(Boolean).join(' — ')
    const row = (label, value) => value
      ? `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>` : ''
    const tokenJs = JSON.stringify(invite.token)
    const nameJs = JSON.stringify(invite.title || 'Evento')
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invitación · ${escapeHtml(invite.title)}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f6fb;color:#1f2430;padding:20px}
.card{max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(55,30,100,.14)}
.head{background:#6d28d9;color:#ffffff;padding:22px}.head small{opacity:.75;letter-spacing:.12em}
.head h1{margin:8px 0 0;font-size:1.35rem}
.body{padding:22px}.row{display:flex;gap:12px;justify-content:space-between;border-bottom:1px solid #e8e5f0;padding:10px 0}
.row span{color:#6b7280}.row strong{text-align:right}
.block{margin-top:18px;white-space:pre-wrap;line-height:1.5}
.answer{margin-top:28px;padding:18px;border-radius:14px;background:#f4edff;border:1px solid #e8e5f0}
.answer.done{background:#d5f0df;border-color:#e8e5f0}
.answer h2{margin:0 0 8px;font-size:1.05rem;color:#6d28d9}
.answer p{margin:6px 0 14px;color:#6b7280;font-size:.92rem}
.answer label{display:block;margin:12px 0 6px;font-weight:600;font-size:.92rem}
.answer input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #e8e5f0;border-radius:10px;font:inherit}
.answer .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.btn{display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;border:0;cursor:pointer;font:inherit}
.btn.no{background:#ffffff;color:#6d28d9;border:1px solid #e8e5f0}
.btn:disabled{opacity:.6;cursor:wait}
.error{color:#b52038!important;font-weight:600}
</style></head><body><div class="card"><div class="head"><small>MARIACHITOTAL</small><h1>Invitación a evento</h1></div><div class="body">
<h1>${escapeHtml(invite.title)}</h1>
${row('Fecha', fmtEventStamp(invite.starts_at))}
${row('Fin estimado', fmtEventStamp(invite.ends_at))}
${Number(invite.tandas) > 0 ? row('Tandas', `${invite.tandas} (${invite.tandas} hora${invite.tandas === 1 ? '' : 's'})`) : ''}
${row('Agrupación', invite.band_name)}
${row('Lugar', place)}
${maps ? `<div class="row"><span>Maps</span><a href="${escapeHtml(maps)}" target="_blank" rel="noreferrer">Abrir ubicación</a></div>` : ''}
${invite.notes ? `<div class="block"><strong>Notas</strong><br>${escapeHtml(invite.notes)}</div>` : ''}
<div class="answer" id="answer">
  <h2>¿Puedes asistir?</h2>
  <p>Escribe tu nombre y teléfono para identificarte. Si ya estás en el catálogo, usaremos tus datos existentes.</p>
  <form id="respond-form">
    <label for="invite-name">Nombre</label>
    <input id="invite-name" name="name" autocomplete="name" maxlength="120" required>
    <label for="invite-phone">Teléfono</label>
    <input id="invite-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="25" required>
    <div class="btns">
      <button class="btn" type="submit" data-status="confirmed">✅ Confirmar asistencia</button>
      <button class="btn no" type="button" id="decline">No puedo asistir</button>
    </div>
    <p class="error" id="respond-error" role="alert"></p>
  </form>
</div>
<script>
(function () {
  const token = ${tokenJs}
  const title = ${nameJs}
  const key = 'mariachi-invite-' + token
  const box = document.getElementById('answer')
  const form = document.getElementById('respond-form')
  const error = document.getElementById('respond-error')
  const buttons = [...form.querySelectorAll('button')]
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null } })()
  const showDone = (data) => {
    sessionStorage.setItem(key, JSON.stringify(data))
    box.classList.add('done')
    box.innerHTML = '<h2>' + (data.status === 'confirmed' ? '✅ Asistencia confirmada' : 'Respuesta registrada') + '</h2>'
      + '<p>' + (data.status === 'confirmed'
        ? 'Gracias, ' + data.name + '. Ya fuiste agregado al evento «' + title + '».'
        : 'Gracias, ' + data.name + '. Registramos que no puedes asistir a «' + title + '».')
      + '</p><button class="btn no" id="change">Cambiar respuesta</button>'
    document.getElementById('change').addEventListener('click', () => {
      sessionStorage.removeItem(key); location.reload()
    })
  }
  if (saved && saved.name) showDone(saved)
  async function respond(status) {
    const name = form.name.value.trim()
    const phone = form.phone.value.trim()
    error.textContent = ''
    if (name.length < 2 || phone.replace(/\\D/g, '').length < 7) {
      error.textContent = 'Escribe tu nombre y un teléfono válido.'; return
    }
    buttons.forEach((b) => { b.disabled = true })
    try {
      const res = await fetch('/e/' + token + '/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, status })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar tu respuesta.')
      showDone(data)
    } catch (err) {
      error.textContent = err.message
      buttons.forEach((b) => { b.disabled = false })
    }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); respond('confirmed') })
  document.getElementById('decline').addEventListener('click', () => respond('declined'))
})()
</script>
</div></div></body></html>`)
  })

  app.post('/e/:token/respond', (req, res) => {
    const invite = getInvite(req.params.token)
    if (!invite) return res.status(404).json({ error: 'Invitación no encontrada' })
    const parsed = zInviteResponse.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Escribe tu nombre y un teléfono válido.' })
    const digits = String(req.body?.phone || '').replace(/\D/g, '')
    if (digits.length < 7 || digits.length > 15) {
      return res.status(400).json({ error: 'Escribe un teléfono válido.' })
    }
    const phone = normalizePhone(digits)
    const name = parsed.data.name.replace(/\s+/g, ' ')
    const status = parsed.data.status
    const rate = Number(invite.rate_per_tanda) || 0
    const payment = rate * (Number(invite.tandas) || 0)
    db.exec('BEGIN')
    try {
      const previous = one('SELECT * FROM event_invite_responses WHERE invite_id = ? AND phone = ?', invite.id, phone)
      let linkedId = previous?.event_musician_id || null
      let ownsRow = Boolean(previous?.owns_event_musician)
      if (status === 'confirmed') {
        if (linkedId && !one('SELECT id FROM event_musicians WHERE id = ? AND event_id = ?', linkedId, invite.event_id)) {
          linkedId = null
          ownsRow = false
        }
        if (!linkedId) {
          const catalog = findOrCreateMusician({
            name, phone: digits, defaultPayment: payment || rate, createdBy: invite.created_by
          })
          const existing = all('SELECT id, musician_id, phone FROM event_musicians WHERE event_id = ?', invite.event_id)
            .find((m) => Number(m.musician_id) === Number(catalog.id) || normalizePhone(m.phone) === phone)
          if (existing) {
            linkedId = existing.id
            ownsRow = false
            run('UPDATE event_musicians SET name = ?, phone = ? WHERE id = ?', name, phone, existing.id)
          } else {
            const info = run(`INSERT INTO event_musicians
              (event_id, musician_id, name, phone, payment_per_tanda, payment_amount, paid)
              VALUES (?, ?, ?, ?, ?, ?, 0)`,
            invite.event_id, catalog.id, name, phone, rate, payment)
            linkedId = Number(info.lastInsertRowid)
            ownsRow = true
          }
        } else {
          run('UPDATE event_musicians SET name = ?, phone = ? WHERE id = ?', name, phone, linkedId)
        }
      } else {
        if (ownsRow && linkedId && one('SELECT id FROM event_musicians WHERE id = ?', linkedId)) {
          run('DELETE FROM event_musicians WHERE id = ?', linkedId)
        }
        linkedId = null
        ownsRow = false
      }
      if (previous) {
        run(`UPDATE event_invite_responses
             SET name = ?, status = ?, event_musician_id = ?, owns_event_musician = ?,
                 updated_at = datetime('now') WHERE id = ?`,
        name, status, linkedId, ownsRow ? 1 : 0, previous.id)
      } else {
        run(`INSERT INTO event_invite_responses
             (invite_id, name, phone, status, event_musician_id, owns_event_musician)
             VALUES (?, ?, ?, ?, ?, ?)`,
        invite.id, name, phone, status, linkedId, ownsRow ? 1 : 0)
      }
      db.exec('COMMIT')
      res.json({ ok: true, name, phone, status })
    } catch (err) {
      db.exec('ROLLBACK')
      console.error('[event invite response]', err)
      res.status(500).json({ error: 'No se pudo registrar tu respuesta. Inténtalo de nuevo.' })
    }
  })

  // ---------- expenses ----------
  app.get('/api/expenses', requireAuth, subGuard, (req, res) => {
    const where = []
    const params = []
    if (req.query.from) { where.push('x.date >= ?'); params.push(req.query.from) }
    if (req.query.to) { where.push('x.date <= ?'); params.push(req.query.to) }
    if (req.user.role !== 'admin') { where.push('x.created_by = ?'); params.push(req.user.id) }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : ''
    res.json(all(`SELECT x.*, e.title AS event_title FROM expenses x LEFT JOIN events e ON e.id = x.event_id
                  ${clause} ORDER BY x.date DESC, x.id DESC`, ...params))
  })

  app.post('/api/expenses', requireAuth, subGuard, (req, res) => {
    const p = z.object({
      event_id: nullableInt.optional().default(null),
      date: z.string().min(10),
      description: z.string().min(1).max(160),
      amount: money
    }).safeParse(req.body || {})
    if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })
    if (p.data.event_id) {
      const event = one('SELECT * FROM events WHERE id = ?', p.data.event_id)
      if (!event || !canAccess(req.user, event)) return notFound(res)
    }
    const info = run('INSERT INTO expenses (event_id, date, description, amount, created_by) VALUES (?, ?, ?, ?, ?)',
      p.data.event_id, p.data.date, p.data.description, p.data.amount, req.user.id)
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) })
  })

  app.delete('/api/expenses/:id', requireAuth, subGuard, (req, res) => {
    const expense = one('SELECT * FROM expenses WHERE id = ?', idParam(req))
    if (!expense || !canAccess(req.user, expense)) return notFound(res)
    run('DELETE FROM expenses WHERE id = ?', expense.id)
    res.json({ ok: true })
  })

  // ---------- report ----------
  app.get('/api/reports', requireAuth, subGuard, (req, res) => {
    const now = new Date()
    const first = localDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const last = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    const from = String(req.query.from || first)
    const to = String(req.query.to || last)
    const events = listEvents({ from, to, viewer: req.user }).filter((e) => e.status !== 'cancelled')
    const expenses = req.user.role === 'admin'
      ? all('SELECT * FROM expenses WHERE date >= ? AND date <= ?', from, to)
      : all('SELECT * FROM expenses WHERE date >= ? AND date <= ? AND created_by = ?', from, to, req.user.id)
    const sum = (arr, key) => arr.reduce((t, x) => t + (Number(x[key]) || 0), 0)
    const totals = {
      charged: sum(events, 'charged_amount'),
      advance: sum(events, 'advance_amount'),
      pending: sum(events, 'charged_amount') - sum(events, 'advance_amount'),
      musicianCommitted: sum(events, 'musician_total'),
      paidToMusicians: sum(events, 'musician_paid'),
      expenses: sum(expenses, 'amount'),
      profit: sum(events, 'charged_amount') - sum(events, 'musician_paid') - sum(expenses, 'amount'),
      eventCount: events.length
    }
    const group = (key, nameKey) => {
      const map = new Map()
      for (const e of events) {
        const k = String(e[key] || 'sin_asignar')
        if (!map.has(k)) map.set(k, { id: e[key], name: e[nameKey] || 'Sin asignar', count: 0, charged: 0, paid: 0 })
        const g = map.get(k)
        g.count++
        g.charged += Number(e.charged_amount) || 0
        g.paid += Number(e.musician_paid) || 0
      }
      return [...map.values()].sort((a, b) => b.charged - a.charged)
    }
    res.json({
      from, to, totals,
      byEvent: events.map((e) => ({
        id: e.id, starts_at: e.starts_at, title: e.title, client_name: e.client_name,
        band_name: e.band_name, charged: e.charged_amount, paid: e.musician_paid,
        expenses: sum(expenses.filter((x) => x.event_id === e.id), 'amount')
      })),
      byClient: group('client_id', 'client_name'),
      byBand: group('band_id', 'band_name'),
      expenses
    })
  })

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'El comprobante es demasiado grande. Máximo 10 MB.' })
    }
    console.error('[api error]', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  })

  return app
}

function cryptoRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = crypto.randomBytes(6)
  for (let i = 0; i < 6; i++) out += chars[bytes[i] % chars.length]
  return out
}
