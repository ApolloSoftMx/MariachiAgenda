// Prueba de humo de la API. Uso: node scripts/smoke.mjs
import fs from 'node:fs'
import path from 'node:path'

for (const f of ['data/smoke.db', 'data/smoke.db-wal', 'data/smoke.db-shm']) {
  fs.rmSync(path.resolve(process.cwd(), f), { force: true })
}
fs.rmSync(path.resolve(process.cwd(), 'data/smoke-backups'), { recursive: true, force: true })
fs.rmSync(path.resolve(process.cwd(), 'data/smoke-receipts'), { recursive: true, force: true })
process.env.DB_PATH = 'data/smoke.db'
process.env.BACKUP_DIR = 'data/smoke-backups'
process.env.GOOGLE_CLIENT_ID = ''
process.env.GOOGLE_CLIENT_SECRET = ''
process.env.BOT_TOKEN = ''
process.env.BOT_USERNAME = ''
process.env.SEED_OWNER_EMAIL = 'smoke@test.local'
process.env.SEED_OWNER_PASSWORD = 'smoke123'
process.env.SEED_OWNER_NAME = 'Smoke'
process.env.ALLOW_REGISTRATION = 'true'

const { createApp } = await import('../server/app.js')
const app = createApp({})
const server = app.listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}/api`

let cookie = ''
async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Cookie: cookie } : { Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined
  })
  const setCookie = res.headers.getSetCookie?.() || []
  if (setCookie.length) cookie = setCookie[0].split(';')[0]
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`)
  return data
}

const results = []
const check = (name, condition) => {
  results.push([name, Boolean(condition)])
  console.log((condition ? 'OK  ' : 'FAIL') + '  ' + name)
}

const config = await call('GET', '/config')
check('config responde', config.appName === 'Agenda Mariachi')
check('Google sin configurar', config.googleEnabled === false)
check('registro abierto', config.registrationEnabled === true)

await call('POST', '/auth/login', { email: 'smoke@test.local', password: 'smoke123' })
const me = await call('GET', '/auth/me')
check('login + sesión', me.user?.email === 'smoke@test.local' && me.user.role === 'admin')
const adminCookie = cookie

const adminConfig = await call('GET', '/admin/config')
check('config admin responde', adminConfig.botTokenSet === false && adminConfig.allowRegistration === true)

const backup = await call('POST', '/admin/backups')
check('respaldo creado', Boolean(backup.name?.endsWith('.db')))
const backups = await call('GET', '/admin/backups')
check('respaldo listado', backups.length === 1 && backups[0].name === backup.name)

const registration = await call('POST', '/auth/register', {
  name: 'Solicitante', email: 'solicitante@test.local', password: 'solicitante123'
})
check('registro queda pendiente', registration.pending === true)
let pendingLogin = false
try {
  await call('POST', '/auth/login', { email: 'solicitante@test.local', password: 'solicitante123' })
} catch (err) { pendingLogin = String(err.message).includes('403') }
check('pendiente no puede entrar', pendingLogin)

cookie = adminCookie
const pendingList = await call('GET', '/users')
const pendingUser = pendingList.find((u) => u.email === 'solicitante@test.local')
check('solicitud visible para admin', pendingUser?.pending_approval === 1)
await call('POST', '/admin/registrations/' + pendingUser.id + '/approve')
const approvedLogin = await call('POST', '/auth/login', { email: 'solicitante@test.local', password: 'solicitante123' })
check('aprobado puede entrar', approvedLogin.user.role === 'user')
cookie = adminCookie

const band = await call('POST', '/bands', { name: 'Mariachi Sol', kind: 'own', color: '#7c3aed' })
const guestBand = await call('POST', '/bands', { name: 'Mariachi Luna', kind: 'guest', responsable: 'Pedro' })
const client = await call('POST', '/clients', { name: 'Ana López', phone: '5512345678' })
const account = await call('POST', '/accounts', { name: 'BBVA', type: 'bank', details: '****1234' })
const musician = await call('POST', '/musicians', { name: 'Luis', phone: '5599998888', default_payment: 800 })
check('catálogos creados', band.id && guestBand.id && client.id && account.id && musician.id)

const event = await call('POST', '/events', {
  title: 'Boda Ana', starts_at: '2026-12-12T19:00', ends_at: '2026-12-13T01:00',
  band_id: band.id, client_id: client.id, location_name: 'Salón El Rancho',
  address: 'Av. Juárez 123, CDMX', status: 'confirmed',
  charged_amount: 12000, advance_amount: 5000, advance_account_id: account.id,
  musicians_planned: 6, notes: 'Llevar traje negro',
  musicians: [
    { musician_id: musician.id, name: 'Luis', phone: '5599998888', payment_amount: 800, paid: true },
    { name: 'Invitado', phone: '5500000000', payment_amount: 500, paid: false }
  ]
})
check('evento creado con músicos', event.id && event.musician_count === 2 && event.musician_total === 1300)
check('número de músicos planeado', event.musicians_planned === 6)
check('rol derivado de agrupación', event.role === 'leader')

const guestEvent = await call('POST', '/events', {
  title: 'Fiesta privada', starts_at: '2026-12-20T20:00', band_id: guestBand.id,
  client_id: client.id, charged_amount: 3000, advance_amount: 0,
  musicians: [{ name: 'Luis', payment_amount: 400, paid: false }]
})
check('evento como invitado', guestEvent.role === 'guest')

const list = await call('GET', '/events?from=2026-12-01&to=2026-12-31')
check('lista por rango', list.length === 2 && list[0].starts_at < list[1].starts_at)

const detail = await call('GET', '/events/' + event.id)
check('detalle incluye músicos', detail.musicians.length === 2)

await call('PATCH', '/events/' + event.id, { advance_amount: 6000, musicians: [
  { musician_id: musician.id, name: 'Luis', phone: '5599998888', payment_amount: 900, paid: true }
] })
const updated = await call('GET', '/events/' + event.id)
check('actualización de evento', updated.advance_amount === 6000 && updated.musicians.length === 1)

const report = await call('GET', '/reports?from=2026-12-01&to=2026-12-31')
check('reporte cobrado', report.totals.charged === 15000)
check('reporte pagado a músicos', report.totals.paidToMusicians === 900)
check('reporte utilidad', report.totals.profit === 14100)
check('reporte por cliente', report.byClient[0]?.name === 'Ana López')

const expense = await call('POST', '/expenses', { date: '2026-12-12', description: 'Gasolina', amount: 300, event_id: event.id })
check('gasto creado', expense.id)
const report2 = await call('GET', '/reports?from=2026-12-01&to=2026-12-31')
check('utilidad descuenta gasto', report2.totals.profit === 13800)

const quote = await call('POST', '/quotes', {
  client_id: client.id, title: 'Boda Ana · propuesta', event_date: '2026-12-12', event_time: '19:00',
  location_name: 'Salón El Rancho', address: 'Av. Principal 123',
  description: 'Mariachi para ceremonia y banquete', musicians_planned: 6,
  amount: 12000, deposit_amount: 500, valid_until: '2026-11-30', status: 'draft',
  deposit_account_id: account.id, deposit_details: 'Referencia BODA-ANA'
})
check('cotización creada', quote.id && quote.share_token && quote.client_name === 'Ana López')
check('cotización con ubicación', quote.location_name === 'Salón El Rancho' && quote.address === 'Av. Principal 123')
check('cotización con hora y depósito', quote.event_time === '19:00' && quote.deposit_amount === 500)

const pdfRes = await fetch(base + `/quotes/${quote.id}/pdf`, { headers: { Cookie: cookie } })
const pdfBytes = Buffer.from(await pdfRes.arrayBuffer())
check('PDF de cotización', pdfRes.ok && pdfBytes.subarray(0, 4).toString() === '%PDF')

const root = base.replace(/\/api$/, '')
const publicRes = await fetch(`${root}/q/${quote.share_token}`)
const publicHtml = await publicRes.text()
check('enlace público de cotización', publicRes.ok && publicHtml.includes('Boda Ana · propuesta')
  && publicHtml.includes('Salón El Rancho') && publicHtml.includes('Abrir ubicación')
  && publicHtml.includes('Aceptar cotización'))
const publicPdf = await fetch(`${root}/q/${quote.share_token}.pdf`)
const publicPdfBytes = Buffer.from(await publicPdf.arrayBuffer())
check('PDF público', publicPdf.ok && publicPdfBytes.subarray(0, 4).toString() === '%PDF')

const share = await call('GET', `/quotes/${quote.id}/share`)
check('compartir construye wa.me', share.whatsappUrl?.startsWith('https://wa.me/525512345678?text='))
check('mensaje incluye depósito', share.message.includes('BBVA') && share.message.includes('BODA-ANA'))
check('mensaje incluye ubicación', share.mapsUrl?.includes('google.com/maps') && share.message.includes('Ubicación en Maps'))
await call('PATCH', `/quotes/${quote.id}`, { status: 'sent' })
const quotesByClient = await call('GET', `/quotes?client_id=${client.id}`)
check('cotización marcada como enviada', quotesByClient[0]?.status === 'sent')

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const acceptRes = await fetch(`${root}/q/${quote.share_token}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png', 'x-file-name': encodeURIComponent('comprobante.png') },
  body: png
})
const accepted = await acceptRes.json().catch(() => ({}))
check('cliente acepta con comprobante', acceptRes.ok && accepted.ok && accepted.eventId)

const acceptedQuote = await call('GET', `/quotes/${quote.id}`)
check('cotización queda aceptada', acceptedQuote.status === 'accepted'
  && acceptedQuote.receipt_name === 'comprobante.png' && acceptedQuote.event_id === accepted.eventId)
const scheduled = await call('GET', `/events/${accepted.eventId}`)
check('evento agendado desde cotización', scheduled.title === quote.title
  && scheduled.starts_at === '2026-12-12T19:00' && scheduled.client_id === client.id
  && scheduled.advance_amount === 500 && scheduled.charged_amount === 12000)
const receiptRes = await fetch(`${root}/q/${quote.share_token}/receipt`)
const receiptBytes = Buffer.from(await receiptRes.arrayBuffer())
check('comprobante se puede descargar', receiptRes.ok && receiptBytes.equals(png))
const acceptedHtml = await fetch(`${root}/q/${quote.share_token}`).then((r) => r.text())
check('página pública muestra aceptación', acceptedHtml.includes('Cotización aceptada y agendada')
  && acceptedHtml.includes('Ver mi comprobante'))
const duplicateRes = await fetch(`${root}/q/${quote.share_token}/accept`, {
  method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png
})
check('no se puede aceptar dos veces', duplicateRes.status === 409)

const user = await call('POST', '/users', { name: 'Usuario final', email: 'user@test.local', password: 'user123', role: 'user' })
check('usuario creado', user.id)
const login = await call('POST', '/auth/login', { email: 'user@test.local', password: 'user123' })
check('login usuario final', login.user.role === 'user')

const ownEvent = await call('POST', '/events', { title: 'Evento propio', starts_at: '2027-01-10T18:00' })
const visibleEvents = await call('GET', '/events')
check('usuario crea y ve solo su evento', ownEvent.id && visibleEvents.length === 1
  && visibleEvents[0].id === ownEvent.id)
let hiddenEvent = false
try { await call('GET', `/events/${event.id}`) } catch (err) { hiddenEvent = String(err.message).includes('404') }
check('usuario no ve evento ajeno', hiddenEvent)
let hiddenPatch = false
try { await call('PATCH', `/events/${event.id}`, { title: 'Hack' }) } catch (err) { hiddenPatch = String(err.message).includes('404') }
check('usuario no edita evento ajeno', hiddenPatch)
let hiddenDelete = false
try { await call('DELETE', `/events/${event.id}`) } catch (err) { hiddenDelete = String(err.message).includes('404') }
check('usuario no borra evento ajeno', hiddenDelete)

const ownQuote = await call('POST', '/quotes', { title: 'Cotización propia', event_date: '2027-01-10' })
const visibleQuotes = await call('GET', '/quotes')
check('usuario crea y ve solo su cotización', ownQuote.id && visibleQuotes.length === 1
  && visibleQuotes[0].id === ownQuote.id)
let hiddenQuote = false
try { await call('GET', `/quotes/${quote.id}`) } catch (err) { hiddenQuote = String(err.message).includes('404') }
check('usuario no ve cotización ajena', hiddenQuote)
const ownReport = await call('GET', '/reports?from=2026-12-01&to=2026-12-31')
check('reporte del usuario excluye datos ajenos', ownReport.totals.eventCount === 0)

let forbidden = false
try { await call('GET', '/users') } catch (err) { forbidden = String(err.message).includes('403') }
check('usuario no administra usuarios', forbidden)
let backupForbidden = false
try { await call('GET', '/admin/backups') } catch (err) { backupForbidden = String(err.message).includes('403') }
check('usuario no administra respaldos', backupForbidden)

cookie = adminCookie
const reg2 = await call('POST', '/auth/register', {
  name: 'Rechazado', email: 'rechazado@test.local', password: 'rechazado123'
})
check('segunda solicitud pendiente', reg2.pending === true)
const list2 = await call('GET', '/users')
const rejectUser = list2.find((u) => u.email === 'rechazado@test.local')
await call('POST', '/admin/registrations/' + rejectUser.id + '/reject')
let rejectedLogin = false
try {
  await call('POST', '/auth/login', { email: 'rechazado@test.local', password: 'rechazado123' })
} catch (err) { rejectedLogin = String(err.message).includes('401') }
check('rechazado no puede entrar', rejectedLogin)

await call('PATCH', '/admin/config', { allowRegistration: false })
const closed = await call('GET', '/config')
check('registro se puede cerrar', closed.registrationEnabled === false)
let closedBlocked = false
try {
  await call('POST', '/auth/register', { name: 'Tarde', email: 'tarde@test.local', password: 'tarde123' })
} catch (err) { closedBlocked = String(err.message).includes('403') }
check('registro cerrado bloquea', closedBlocked)
await call('PATCH', '/admin/config', { allowRegistration: true })

const failed = results.filter(([, ok]) => !ok)
await new Promise((r) => server.close(r))
const { db } = await import('../server/db.js')
db.close()
for (const f of ['data/smoke.db', 'data/smoke.db-wal', 'data/smoke.db-shm']) {
  fs.rmSync(path.resolve(process.cwd(), f), { force: true })
}
fs.rmSync(path.resolve(process.cwd(), 'data/smoke-backups'), { recursive: true, force: true })
fs.rmSync(path.resolve(process.cwd(), 'data/smoke-receipts'), { recursive: true, force: true })
console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`)
if (failed.length) process.exit(1)
