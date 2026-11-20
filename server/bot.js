import { Bot, InlineKeyboard } from 'grammy'
import { all, one, run } from './db.js'
import { saveEvent } from './events.js'
import { setting, setSetting } from './settings.js'

const pad = (n) => String(n).padStart(2, '0')
const localStamp = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const prettyDate = (stamp) => {
  const d = new Date(stamp)
  if (Number.isNaN(d.getTime())) return stamp
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(d)
}

function eventLine(e, withMaps = true) {
  const band = e.band_name ? ` · ${e.band_name}${e.role === 'guest' ? ` (invitado de ${e.band_responsable || 'otro encargado'})` : ' (tu grupo)'}` : ''
  const where = e.location_name ? `\n📍 ${e.location_name}${e.address ? ` — ${e.address}` : ''}` : ''
  const maps = withMaps && e.maps_url ? `\n🗺️ ${e.maps_url}` : ''
  return `🎺 ${e.title}\n🗓️ ${prettyDate(e.starts_at)}${band}${e.client_name ? `\n👤 ${e.client_name}` : ''}${where}${maps}`
}

function upcoming(limit = 10, onlyToday = false, userId = null) {
  const now = localStamp(new Date())
  const today = now.slice(0, 10)
  const owner = userId ? ' AND e.created_by = ?' : ''
  if (onlyToday) {
    return all(`SELECT e.*, c.name AS client_name, b.name AS band_name, b.kind AS band_kind,
                       b.responsable AS band_responsable
                FROM events e LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN bands b ON b.id = e.band_id
                WHERE substr(e.starts_at,1,10) = ? AND e.status <> 'cancelled'${owner}
                ORDER BY e.starts_at LIMIT ?`, ...(userId ? [today, userId, limit] : [today, limit]))
  }
  return all(`SELECT e.*, c.name AS client_name, b.name AS band_name, b.kind AS band_kind,
                     b.responsable AS band_responsable
              FROM events e LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN bands b ON b.id = e.band_id
              WHERE e.starts_at >= ? AND e.status <> 'cancelled'${owner}
              ORDER BY e.starts_at LIMIT ?`, ...(userId ? [now, userId, limit] : [now, limit]))
}

async function checkReminders(bot) {
  const now = localStamp(new Date())
  const in24 = localStamp(new Date(Date.now() + 24 * 60 * 60 * 1000))
  const in1 = localStamp(new Date(Date.now() + 60 * 60 * 1000))
  const events = all(`SELECT e.*, c.name AS client_name, b.name AS band_name, b.kind AS band_kind,
                             b.responsable AS band_responsable
                      FROM events e LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN bands b ON b.id = e.band_id
                      WHERE e.starts_at >= ? AND e.starts_at <= ? AND e.status <> 'cancelled'`, now, in24)
  if (!events.length) return
  for (const event of events) {
    const user = one(`SELECT id, name, telegram_chat_id FROM users
                      WHERE id = ? AND active = 1 AND telegram_chat_id IS NOT NULL`, event.created_by)
    if (!user) continue
    const kind = event.starts_at <= in1 ? 'reminder_1h' : 'reminder_24h'
    const label = kind === 'reminder_1h' ? 'Recordatorio: empieza en menos de 1 hora' : 'Recordatorio: mañana'
    const info = run('INSERT OR IGNORE INTO telegram_notifications (event_id, user_id, kind) VALUES (?, ?, ?)',
      event.id, user.id, kind)
    if (!info.changes) continue
    try {
      await bot.api.sendMessage(user.telegram_chat_id, `${label}\n\n${eventLine(event)}`)
    } catch (err) {
      console.warn('[bot] no se pudo notificar a', user.name, err.message)
    }
  }
}

let botInstance = null
let reminderTimer = null
const eventDrafts = new Map()

const parseStamp = (value) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const stamp = `${y}-${pad(Number(mo))}-${pad(Number(d))}T${pad(Number(h))}:${mi}`
  const probe = new Date(`${stamp}:00`)
  if (Number.isNaN(probe.getTime())) return null
  if (probe.getFullYear() !== Number(y) || probe.getMonth() + 1 !== Number(mo)
    || probe.getDate() !== Number(d)) return null
  return stamp
}

const parseNumber = (value) => {
  const n = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function linkedUser(ctx) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || '')
  return { chatId, user: one('SELECT id, name, role FROM users WHERE telegram_chat_id = ? AND active = 1', chatId) }
}

function findOrCreateClient(name, userId) {
  const clean = String(name || '').trim()
  if (!clean || clean === '-') return null
  let client = one('SELECT id FROM clients WHERE name = ? COLLATE NOCASE AND created_by = ?', clean, userId)
  if (!client) {
    const info = run('INSERT INTO clients (name, phone, notes, created_by) VALUES (?, ?, ?, ?)',
      clean, '', '', userId)
    client = { id: Number(info.lastInsertRowid) }
  }
  return Number(client.id)
}

function saveEventFromSource(event, userId, source) {
  return saveEvent({
    ...event,
    role: 'leader',
    status: 'confirmed',
    musicians: [],
    notes: `Agendado desde Telegram (${source})`
  }, null, userId)
}

const DRAFT_STEPS = [
  { key: 'title', prompt: '¿Cómo se llama el evento?' },
  { key: 'starts_at', prompt: '¿Cuándo es? Escribe la fecha y hora así: `2026-12-12 19:00`' },
  { key: 'tandas', prompt: '¿Cuántas tandas (horas) son? Escribe un número, por ejemplo `3`.' },
  { key: 'location_name', prompt: '¿Dónde es? Escribe `-` si aún no lo sabes.' },
  { key: 'clientName', prompt: '¿Quién es el cliente? Escribe `-` si no aplica.' },
  { key: 'musicians_planned', prompt: '¿Cuántos músicos planeas? Escribe `0` si aún no lo sabes.' },
  { key: 'charged_amount', prompt: '¿Cuánto vas a cobrar? Escribe `0` si aún no lo sabes.' }
]

const COMMANDS = [
  '/start CÓDIGO — vincular tu cuenta',
  '/nuevo — agendar un evento paso a paso',
  '/cancelar — cancelar el comando en curso',
  '/evento Título | AAAA-MM-DD HH:mm | Tandas | Lugar | Cliente | Músicos | Cobro — alta rápida',
  '/agenda — próximos 10 eventos',
  '/hoy — eventos de hoy',
  '/proximo — siguiente evento',
  '/pendientes — registros por aprobar (solo admin)',
  '/ayuda — ver estas opciones'
]

const KNOWN_COMMANDS = ['start', 'nuevo', 'agendar', 'cancelar', 'evento', 'agenda', 'hoy', 'proximo', 'pendientes', 'ayuda', 'help']

const optionsText = () => `Opciones disponibles:\n${COMMANDS.map((line) => `• ${line}`).join('\n')}`
const withOptions = (message) => `${message}\n\n${optionsText()}`
const unknownCommandText = (command) => withOptions(`No conozco ese comando: ${command}`)
const cancelReplyText = (hadDraft) => withOptions(hadDraft
  ? 'Comando cancelado. No guardé el borrador.'
  : 'No hay ningún comando en curso.')
const linkMessage = () => 'Primero vincula tu cuenta desde la web: Configuración → Vincular Telegram.\n\nEscribe /ayuda para ver opciones.'
const cancelMarkup = () => new InlineKeyboard().text('✕ Cancelar', 'event:cancel')

function draftSummary(d) {
  return [
    '📝 Revisa el evento:',
    `🎺 ${d.title}`,
    `🗓️ ${prettyDate(d.starts_at)}`,
    d.tandas ? `⏱️ Tandas: ${d.tandas}` : '',
    d.location_name ? `📍 ${d.location_name}` : '',
    d.clientName ? `👤 ${d.clientName}` : '',
    `🎼 Músicos: ${d.musicians_planned}`,
    `💰 Cobro: $${Number(d.charged_amount || 0).toFixed(2)}`
  ].filter(Boolean).join('\n')
}

async function askNextDraftStep(ctx, draft) {
  if (draft.step >= DRAFT_STEPS.length) {
    eventDrafts.set(draft.chatId, draft)
    return ctx.reply(`${draftSummary(draft)}\n\n¿Lo guardo en tu agenda?`, {
      reply_markup: new InlineKeyboard()
        .text('✅ Guardar', 'event:save')
        .text('✕ Cancelar', 'event:cancel')
    })
  }
  return ctx.reply(`${DRAFT_STEPS[draft.step].prompt}\n\nEscribe /cancelar si quieres salir.`, {
    reply_markup: cancelMarkup()
  })
}

export { optionsText, unknownCommandText, cancelReplyText }

export function getBot() {
  return botInstance
}

export async function stopBot() {
  if (reminderTimer) {
    clearInterval(reminderTimer)
    reminderTimer = null
  }
  const bot = botInstance
  botInstance = null
  if (!bot) return
  try {
    await bot.stop()
  } catch (err) {
    console.warn('[bot] al detener:', err.message)
  }
}

export async function restartBot(config = {}) {
  await stopBot()
  await new Promise((resolve) => setTimeout(resolve, 300))
  return startBot(config)
}

export async function notifyAdmins(text, keyboard) {
  const bot = botInstance
  if (!bot) return 0
  const admins = all(`SELECT id, name, telegram_chat_id FROM users
                      WHERE role = 'admin' AND active = 1 AND telegram_chat_id IS NOT NULL`)
  let sent = 0
  for (const admin of admins) {
    try {
      const markup = typeof keyboard === 'function' ? keyboard() : keyboard
      await bot.api.sendMessage(admin.telegram_chat_id, text, markup ? { reply_markup: markup } : undefined)
      sent++
    } catch (err) {
      console.warn('[bot] no se pudo notificar al admin', admin.name, err.message)
    }
  }
  return sent
}

export function notifyAdminsAboutRegistration(user, method = 'correo') {
  const text = `🆕 Nuevo registro (${method})\n\n👤 ${user.name}\n✉️ ${user.email}\n\n¿Le damos acceso al sistema?`
  return notifyAdmins(text, () => new InlineKeyboard()
    .text('✅ Aprobar', `approve:${user.id}`)
    .text('⛔ Rechazar', `reject:${user.id}`))
}

export function startBot(config = {}) {
  const token = setting('bot_token', 'BOT_TOKEN')
  config.botUsername = setting('bot_username', 'BOT_USERNAME')
  if (!token) {
    console.log('[bot] Sin token: el bot queda desactivado (la web y la API funcionan normal).')
    return null
  }

  const bot = new Bot(token)
  botInstance = bot

  bot.command('start', async (ctx) => {
    const code = String(ctx.match || '').trim().toUpperCase()
    if (!code) {
      return ctx.reply(withOptions('Hola 👋 Soy tu agenda de mariachi.\n\nPara vincular tu cuenta, abre la web → Configuración → «Vincular Telegram» y envíame el código así: /start ABC123.'))
    }
    const user = one('SELECT * FROM users WHERE telegram_link_code = ? AND active = 1', code)
    if (!user) return ctx.reply(withOptions('Ese código no es válido o ya expiró. Genera uno nuevo en la web.'))
    const chatId = String(ctx.chat.id)
    run('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ? AND id <> ?', chatId, user.id)
    run('UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?', chatId, user.id)
    await ctx.reply(`Listo, ${user.name} ✅ Tu Telegram ya está vinculado. Te avisaré de los eventos próximos.`)
  })

  bot.command('agenda', async (ctx) => {
    const { user } = linkedUser(ctx)
    if (!user) return ctx.reply(linkMessage())
    const events = upcoming(10, false, user.role === 'admin' ? null : user.id)
    if (!events.length) return ctx.reply(withOptions('No tienes eventos próximos. ¡A agendar!'))
    const text = events.map((e, i) => `${i + 1}. ${eventLine(e, false)}`).join('\n\n')
    await ctx.reply(`Próximos eventos\n\n${text}`)
  })

  bot.command('hoy', async (ctx) => {
    const { user } = linkedUser(ctx)
    if (!user) return ctx.reply(linkMessage())
    const events = upcoming(20, true, user.role === 'admin' ? null : user.id)
    if (!events.length) return ctx.reply(withOptions('Hoy no tienes eventos.'))
    await ctx.reply(events.map((e) => eventLine(e)).join('\n\n'))
  })

  bot.command('proximo', async (ctx) => {
    const { user } = linkedUser(ctx)
    if (!user) return ctx.reply(linkMessage())
    const events = upcoming(1, false, user.role === 'admin' ? null : user.id)
    if (!events.length) return ctx.reply(withOptions('No hay eventos próximos.'))
    await ctx.reply(eventLine(events[0]))
  })

  bot.command(['nuevo', 'agendar'], async (ctx) => {
    const { chatId, user } = linkedUser(ctx)
    if (!user) return ctx.reply(linkMessage())
    eventDrafts.set(chatId, { chatId, userId: user.id, step: 0 })
    await ctx.reply('Vamos a agendar un evento ✍️. Escribe `-` para omitir cualquier dato opcional.\n\n'
      + DRAFT_STEPS[0].prompt + '\n\nEscribe /cancelar si quieres salir.', { reply_markup: cancelMarkup() })
  })

  bot.command('cancelar', (ctx) => {
    const chatId = String(ctx.chat?.id || ctx.from?.id || '')
    const hadDraft = eventDrafts.delete(chatId)
    return ctx.reply(cancelReplyText(hadDraft))
  })

  bot.command('evento', async (ctx) => {
    const { user } = linkedUser(ctx)
    if (!user) return ctx.reply(linkMessage())
    const raw = String(ctx.match || '').trim()
    if (!raw) {
      return ctx.reply(withOptions('Uso rápido:\n`/evento Boda Ana | 2026-12-12 19:00 | 3 | Salón El Rancho | Ana López | 6 | 12000`\n\nEl tercer dato son las tandas (horas). O escribe /nuevo para que te guíe paso a paso.'))
    }
    const parts = raw.split('|').map((p) => p.trim())
    const startsAt = parseStamp(parts[1])
    if (!parts[0] || !startsAt) {
      return ctx.reply('No entendí el evento. Usa: `/evento Título | AAAA-MM-DD HH:mm | Tandas | Lugar | Cliente | Músicos | Cobro`')
    }
    const tandas = parseNumber(parts[2])
    const musicians = parseNumber(parts[5])
    const amount = parseNumber(parts[6])
    if (tandas === null || musicians === null || amount === null) return ctx.reply('Las tandas, el número de músicos y el cobro deben ser cantidades válidas.')
    try {
      const event = saveEventFromSource({
        title: parts[0],
        starts_at: startsAt,
        ends_at: null,
        tandas,
        location_name: parts[3] === '-' ? '' : (parts[3] || ''),
        address: '',
        maps_url: '',
        client_id: findOrCreateClient(parts[4], user.id),
        musicians_planned: musicians,
        charged_amount: amount,
        advance_amount: 0,
        advance_account_id: null
      }, user.id, 'comando /evento')
      await ctx.reply(`✅ Evento agendado: *${event.title}*\n🗓️ ${prettyDate(event.starts_at)}\n\nLo ves en la web → Eventos.`)
    } catch (err) {
      console.error('[bot] no se pudo agendar:', err)
      await ctx.reply('No se pudo guardar el evento. Revisa los datos e inténtalo de nuevo.')
    }
  })

  bot.on('message:text', async (ctx) => {
    const text = String(ctx.message.text || '').trim()
    const { chatId } = linkedUser(ctx)
    const draft = eventDrafts.get(chatId)

    if (text.startsWith('/')) {
      const command = text.match(/^\/([A-Za-z_]+)/)?.[1]?.toLowerCase()
      if (command && KNOWN_COMMANDS.includes(command)) return
      return ctx.reply(unknownCommandText(text.split(/\s/)[0]))
    }

    if (!draft || draft.step >= DRAFT_STEPS.length) return
    const step = DRAFT_STEPS[draft.step]

    if (step.key === 'starts_at') {
      const stamp = parseStamp(text)
      if (!stamp) return ctx.reply('Usa este formato: `2026-12-12 19:00` (año-mes-día hora:minuto). Escribe /cancelar para salir.')
      draft[step.key] = stamp
    } else if (step.key === 'tandas' || step.key === 'musicians_planned' || step.key === 'charged_amount') {
      const n = parseNumber(text)
      if (n === null) return ctx.reply('Escribe solo un número, por ejemplo `6` o `12000`. Escribe /cancelar para salir.')
      draft[step.key] = n
    } else {
      draft[step.key] = text === '-' ? '' : text.slice(0, 160)
    }

    draft.step += 1
    await askNextDraftStep(ctx, draft)
  })

  bot.command('pendientes', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const admin = one("SELECT * FROM users WHERE telegram_chat_id = ? AND role = 'admin' AND active = 1", chatId)
    if (!admin) return ctx.reply('Solo el super administrador puede ver los registros pendientes.')
    const pending = all('SELECT id, name, email FROM users WHERE pending_approval = 1 ORDER BY created_at')
    if (!pending.length) return ctx.reply(withOptions('No hay registros pendientes. 🎉'))
    for (const user of pending) {
      await ctx.reply(`👤 ${user.name}\n✉️ ${user.email}\n\n¿Le damos acceso?`, {
        reply_markup: new InlineKeyboard()
          .text('✅ Aprobar', `approve:${user.id}`)
          .text('⛔ Rechazar', `reject:${user.id}`)
      })
    }
  })

  bot.command(['ayuda', 'help'], (ctx) => ctx.reply(optionsText()))

  bot.on('callback_query:data', async (ctx) => {
    const [action, idText] = String(ctx.callbackQuery.data || '').split(':')

    if (action === 'event') {
      const { chatId } = linkedUser(ctx)
      const draft = eventDrafts.get(chatId)
      if (!draft) return ctx.answerCallbackQuery({ text: 'No había un borrador en curso. Usa /nuevo para empezar.' })
      if (idText === 'cancel') {
        eventDrafts.delete(chatId)
        await ctx.answerCallbackQuery({ text: 'Borrador cancelado' })
        await ctx.editMessageText('Borrador cancelado. Usa /nuevo para empezar o /ayuda para ver opciones.').catch(() => {})
        return
      }
      if (idText !== 'save') return ctx.answerCallbackQuery()
      if (draft.step < DRAFT_STEPS.length || !draft.title || !draft.starts_at) {
        return ctx.answerCallbackQuery({ text: 'Aún faltan datos del evento.' })
      }
      try {
        const event = saveEventFromSource({
          title: draft.title,
          starts_at: draft.starts_at,
          ends_at: null,
          tandas: Number(draft.tandas) || 0,
          location_name: draft.location_name,
          address: '',
          maps_url: '',
          client_id: findOrCreateClient(draft.clientName, draft.userId),
          musicians_planned: Number(draft.musicians_planned) || 0,
          charged_amount: Number(draft.charged_amount) || 0,
          advance_amount: 0,
          advance_account_id: null
        }, draft.userId, 'asistente de Telegram')
        eventDrafts.delete(chatId)
        await ctx.answerCallbackQuery({ text: 'Evento guardado' })
        await ctx.editMessageText(`✅ Evento agendado: *${event.title}*\n🗓️ ${prettyDate(event.starts_at)}\n\nLo ves en la web → Eventos.`, {
          reply_markup: { inline_keyboard: [] }
        }).catch(() => {})
      } catch (err) {
        console.error('[bot] no se pudo guardar borrador:', err)
        await ctx.answerCallbackQuery({ text: 'No se pudo guardar el evento.' })
      }
      return
    }

    if (!['approve', 'reject'].includes(action)) return ctx.answerCallbackQuery()

    const chatId = String(ctx.chat?.id || ctx.from?.id || '')
    const admin = one("SELECT * FROM users WHERE telegram_chat_id = ? AND role = 'admin' AND active = 1", chatId)
    if (!admin) {
      return ctx.answerCallbackQuery({ text: 'Solo un super administrador puede aprobar registros.' })
    }

    const target = one('SELECT * FROM users WHERE id = ?', Number(idText))
    if (!target) return ctx.answerCallbackQuery({ text: 'Ese usuario ya no existe.' })
    if (!target.pending_approval) {
      return ctx.answerCallbackQuery({ text: 'Esta solicitud ya fue atendida.' })
    }

    if (action === 'approve') {
      run('UPDATE users SET active = 1, pending_approval = 0 WHERE id = ?', target.id)
    } else {
      run('UPDATE users SET active = 0, pending_approval = 0 WHERE id = ?', target.id)
    }
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Usuario aprobado' : 'Usuario rechazado' })

    const result = action === 'approve' ? '✅ Aprobado' : '⛔ Rechazado'
    const base = ctx.callbackQuery.message?.text || `Registro de ${target.name}`
    try {
      await ctx.editMessageText(`${base}\n\n${result} por ${admin.name}`, {
        reply_markup: { inline_keyboard: [] }
      })
    } catch (err) {
      console.warn('[bot] no se pudo editar el mensaje:', err.message)
    }
  })

  bot.catch((err) => console.error('[bot] error:', err))

  bot.start({
    onStart: (me) => {
      config.botUsername = me.username
      setSetting('bot_username', me.username)
      console.log(`[bot] @${me.username} activo`)
    }
  }).catch((err) => {
    console.error('[bot] no se pudo iniciar:', err.message)
    if (botInstance === bot) botInstance = null
    if (reminderTimer) {
      clearInterval(reminderTimer)
      reminderTimer = null
    }
  })

  reminderTimer = setInterval(
    () => checkReminders(bot).catch((err) => console.error('[bot] recordatorios:', err)),
    120_000
  )
  setTimeout(() => checkReminders(bot).catch(() => {}), 15_000)

  return bot
}
