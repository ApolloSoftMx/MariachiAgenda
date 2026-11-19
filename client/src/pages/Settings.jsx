import { useEffect, useState } from 'react'
import { api, useLoad } from '../api.js'
import { useApp } from '../App.jsx'
import { Loading, ErrorBox, Section, Field, Btn, Modal, Badge, confirmAction, useNotify } from '../ui.jsx'
import { copyText } from '../quote.js'

const blankUser = { name: '', email: '', password: '', role: 'user', phone: '' }
const roleLabel = (role) => (role === 'admin' ? 'Super administrador' : 'Usuario')

function TelegramCard({ config, isAdmin }) {
  const notify = useNotify()
  const { user, refreshUser } = useApp()
  const [code, setCode] = useState(null)
  const linked = Boolean(user.telegramLinked)

  async function generate() {
    try {
      const data = await api.post('/telegram/link')
      setCode(data.code)
      const username = config.botUsername || ''
      if (username) {
        const link = `https://t.me/${username}?start=${data.code}`
        await copyText(`/start ${data.code}`).catch(() => {})
        const opened = window.open(link, '_blank', 'noopener,noreferrer')
        notify(opened
          ? 'Telegram se abrió con el mensaje listo; solo pulsa Iniciar/Enviar'
          : 'Telegram no se pudo abrir. Usa el botón «Abrir Telegram» de abajo.')
      } else {
        notify('Código generado, pero el bot aún no tiene token. Pídele al administrador que lo active.')
      }
    } catch (err) { notify(err.message) }
  }

  async function unlink() {
    try {
      await api.del('/telegram/unlink')
      setCode(null)
      await refreshUser()
      notify('Telegram desvinculado')
    } catch (err) { notify(err.message) }
  }

  const bot = config.botEnabled ? config.botUsername : ''
  const deepLink = bot && code ? `https://t.me/${bot}?start=${code}` : null

  return (
    <Section title="Bot de Telegram" subtitle="Recibe recordatorios de eventos y agenda desde el celular">
      <div className="stack">
        <div className="row gap wrap">
          <Badge tone={linked ? 'green' : 'gray'}>{linked ? 'Telegram vinculado' : 'Telegram sin vincular'}</Badge>
          {linked && <button className="link-btn" onClick={unlink}>Desvincular chat</button>}
        </div>
        {bot ? <p className="muted small">Bot: <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">@{bot}</a></p>
          : <p className="muted small">
            {isAdmin
              ? 'Actívalo abajo en «Configuración del sistema». El super administrador debe vincular su Telegram para recibir las solicitudes de registro.'
              : 'El super administrador todavía no activó el bot.'}
          </p>}
        {code ? (
          <div className="code-box">
            <p>Tu código: <strong>{code}</strong></p>
            <p className="muted small">Telegram se abre con este mensaje listo; si no se abre, cópialo o pulsa el botón:</p>
            <code>/start {code}</code>
            {deepLink && <a className="btn btn-primary btn-sm" href={deepLink} target="_blank" rel="noreferrer">Abrir Telegram</a>}
            <Btn variant="ghost" className="btn-sm" onClick={() => copyText(`/start ${code}`).then(() => notify('Mensaje copiado'))}>Copiar mensaje</Btn>
          </div>
        ) : (
          <Btn onClick={generate}>{linked ? 'Generar otro código' : 'Vincular mi Telegram'}</Btn>
        )}
        {bot && (
          <p className="muted small">
            Desde Telegram puedes escribir <code>/nuevo</code> para agendar un evento paso a paso,
            o <code>/evento Título | AAAA-MM-DD HH:mm | Lugar | Cliente | Músicos | Cobro</code> para hacerlo rápido.
          </p>
        )}
      </div>
    </Section>
  )
}

function PasswordCard() {
  const notify = useNotify()
  const [form, setForm] = useState({ current: '', next: '' })
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault(); setError('')
    try {
      await api.post('/auth/password', form)
      setForm({ current: '', next: '' }); notify('Contraseña actualizada')
    } catch (err) { setError(err.message) }
  }
  return (
    <Section title="Cambiar contraseña">
      <form className="stack" onSubmit={save} style={{ maxWidth: 420 }}>
        {error && <ErrorBox message={error} />}
        <Field label="Contraseña actual"><input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></Field>
        <Field label="Nueva contraseña"><input type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} minLength={6} required /></Field>
        <Btn type="submit">Actualizar</Btn>
      </form>
    </Section>
  )
}

function AdminConfigCard() {
  const notify = useNotify()
  const { refreshConfig } = useApp()
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/config'), [])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!data) return
    setForm({
      botToken: '',
      botUsername: data.botUsername || '',
      googleClientId: data.googleClientId || '',
      googleClientSecret: '',
      allowRegistration: Boolean(data.allowRegistration),
      allowGoogleSignup: Boolean(data.allowGoogleSignup),
      guestColor: data.guestColor || '#e11d48'
    })
  }, [data])

  if (loading || !form) return <Loading />
  if (error) return <ErrorBox message={error} />

  async function save(e) {
    e.preventDefault()
    setBusy(true); setFormError('')
    try {
      await api.patch('/admin/config', {
        botToken: form.botToken,
        botUsername: form.botUsername,
        googleClientId: form.googleClientId,
        googleClientSecret: form.googleClientSecret,
        allowRegistration: form.allowRegistration,
        allowGoogleSignup: form.allowGoogleSignup,
        guestColor: form.guestColor
      })
      setForm((f) => ({ ...f, botToken: '', googleClientSecret: '' }))
      reload()
      await refreshConfig()
      notify('Configuración guardada')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function clearBot() {
    confirmAction('¿Quitar el token del bot? Dejarán de llegar avisos por Telegram.', async () => {
      try {
        await api.patch('/admin/config', { clearBotToken: true })
        reload(); await refreshConfig(); notify('Bot desactivado')
      } catch (err) { notify(err.message) }
    })
  }

  async function clearGoogle() {
    confirmAction('¿Quitar las credenciales de Google?', async () => {
      try {
        await api.patch('/admin/config', { clearGoogle: true })
        reload(); await refreshConfig(); notify('Acceso con Google desactivado')
      } catch (err) { notify(err.message) }
    })
  }

  return (
    <Section title="Configuración del sistema" subtitle="Bot de Telegram, acceso con Google y registro de usuarios">
      <form className="stack-lg" onSubmit={save}>
        {formError && <ErrorBox message={formError} />}

        <div className="form-card">
          <h3>Bot de Telegram</h3>
          <p className="muted small">
            Crea un bot con <strong>@BotFather</strong> en Telegram y pega aquí el token.
            El super administrador debe vincular su Telegram para recibir las solicitudes de registro.
          </p>
          <div className="grid-2">
            <Field label="Token del bot" hint={data.botTokenSet ? 'Ya hay un token guardado. Escribe uno nuevo solo si quieres reemplazarlo.' : 'Ejemplo: 123456789:AAH...'}>
              <input type="password" value={form.botToken} autoComplete="off"
                placeholder={data.botTokenSet ? 'Guardado — escribe para reemplazar' : ''}
                onChange={(e) => setForm({ ...form, botToken: e.target.value })} />
            </Field>
            <Field label="Usuario del bot" hint="Sin @. Se llena solo cuando el bot arranca.">
              <input value={form.botUsername} placeholder="mi_agenda_bot"
                onChange={(e) => setForm({ ...form, botUsername: e.target.value })} />
            </Field>
          </div>
          <div className="row gap wrap">
            <Badge tone={data.botTokenSet ? 'green' : 'gray'}>
              {data.botTokenSet ? 'Token guardado' : 'Bot sin token'}
            </Badge>
            {data.botTokenFromEnv && <Badge tone="blue">También definido en .env</Badge>}
            {data.botTokenSet && <button type="button" className="link-btn" onClick={clearBot}>Quitar bot</button>}
          </div>
        </div>

        <div className="form-card">
          <h3>Acceso con Google</h3>
          <p className="muted small">
            Crea un <strong>ID de cliente OAuth 2.0</strong> tipo «Aplicación web» en Google Cloud Console.
            En «URI de redirección autorizados» pega exactamente esta dirección:
          </p>
          <p><code className="inline-code">{data.googleRedirectUri}</code></p>
          <div className="grid-2">
            <Field label="Client ID">
              <input value={form.googleClientId} placeholder="...apps.googleusercontent.com"
                onChange={(e) => setForm({ ...form, googleClientId: e.target.value })} />
            </Field>
            <Field label="Client Secret" hint={data.googleClientSecretSet ? 'Ya hay un secreto guardado. Escribe uno nuevo solo si quieres reemplazarlo.' : ''}>
              <input type="password" value={form.googleClientSecret} autoComplete="off"
                placeholder={data.googleClientSecretSet ? 'Guardado — escribe para reemplazar' : ''}
                onChange={(e) => setForm({ ...form, googleClientSecret: e.target.value })} />
            </Field>
          </div>
          <div className="row gap wrap">
            <Badge tone={data.googleClientId && data.googleClientSecretSet ? 'green' : 'gray'}>
              {data.googleClientId && data.googleClientSecretSet ? 'Google configurado' : 'Google sin configurar'}
            </Badge>
            {data.googleFromEnv && <Badge tone="blue">También definido en .env</Badge>}
            {(data.googleClientId || data.googleClientSecretSet) && (
              <button type="button" className="link-btn" onClick={clearGoogle}>Quitar Google</button>
            )}
          </div>
        </div>

        <div className="form-card">
          <h3>Color de eventos como invitado</h3>
          <p className="muted small">
            Los eventos de tu grupo usan el color de la agrupación. Los eventos en los que vas como invitado
            se muestran con este color en el calendario y la lista de eventos.
          </p>
          <div className="row gap" style={{ alignItems: 'center' }}>
            <Field label="Color para invitados">
              <input type="color" value={form.guestColor}
                onChange={(e) => setForm({ ...form, guestColor: e.target.value })} />
            </Field>
            <span className="color-dot" style={{ background: form.guestColor, width: 28, height: 28 }} />
            <code className="inline-code">{form.guestColor}</code>
          </div>
        </div>

        <div className="form-card">
          <h3>Registro de usuarios</h3>
          <label className="check-row">
            <input type="checkbox" checked={form.allowRegistration}
              onChange={(e) => setForm({ ...form, allowRegistration: e.target.checked })} />
            <span>Permitir que cualquier persona solicite acceso desde la pantalla de inicio</span>
          </label>
          <p className="muted small">
            Las solicitudes no entran directo: quedan pendientes y el super administrador las aprueba o rechaza.
            Si vinculaste tu Telegram, recibirás un mensaje con botones para decidir.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={form.allowGoogleSignup}
              onChange={(e) => setForm({ ...form, allowGoogleSignup: e.target.checked })} />
            <span>Crear solicitud automática cuando alguien entra con Google por primera vez</span>
          </label>
        </div>

        <div className="row gap">
          <Btn type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</Btn>
          {data.pendingCount > 0 && <Badge tone="amber">{data.pendingCount} solicitud(es) pendiente(s)</Badge>}
        </div>
      </form>
    </Section>
  )
}

function AdminStatusCard() {
  const { data, loading, error } = useLoad(() => api.get('/admin/status'), [])
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  return (
    <Section title="Estado del sistema" subtitle="Solo el super administrador ve esta información">
      <div className="table-wrap"><table>
        <tbody>
          <tr><td><strong>Bot de Telegram</strong></td><td>{data.botConfigured ? (data.botUsername ? `@${data.botUsername}` : 'Configurado') : 'Sin configurar'}</td></tr>
          <tr><td><strong>Acceso con Google</strong></td><td>{data.googleEnabled ? 'Activado' : 'Sin configurar'}</td></tr>
          <tr><td><strong>Registro abierto</strong></td><td>{data.registrationEnabled ? 'Sí, con aprobación' : 'No'}</td></tr>
          <tr><td><strong>Solicitudes pendientes</strong></td><td>{data.pendingCount}</td></tr>
          <tr><td><strong>URL pública</strong></td><td>{data.appUrl || '—'}</td></tr>
          <tr><td><strong>Node.js</strong></td><td>{data.node}</td></tr>
          <tr><td><strong>Base de datos</strong></td><td>{data.dbPath}</td></tr>
        </tbody>
      </table></div>
    </Section>
  )
}

const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const fmtDate = (iso) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

function BackupsCard() {
  const notify = useNotify()
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/backups'), [])
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const backup = await api.post('/admin/backups')
      notify(`Respaldo creado: ${backup.name}`)
      reload()
    } catch (err) { notify(err.message) } finally { setBusy(false) }
  }

  async function remove(name) {
    confirmAction(`¿Eliminar el respaldo ${name}?`, async () => {
      try {
        await api.del('/admin/backups/' + encodeURIComponent(name))
        reload(); notify('Respaldo eliminado')
      } catch (err) { notify(err.message) }
    })
  }

  return (
    <Section title="Respaldos" subtitle="Copia de la base de datos; puedes descargarla o guardarla en otro disco"
      actions={<Btn onClick={create} disabled={busy}>{busy ? 'Creando…' : '+ Crear respaldo'}</Btn>}>
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {!loading && !error && (data || []).length === 0 && (
        <p className="muted small">Aún no hay respaldos. Crea el primero con el botón de arriba.</p>
      )}
      {!loading && !error && (data || []).length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Archivo</th><th>Tamaño</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.name}>
                <td><strong>{b.name}</strong></td>
                <td>{fmtSize(b.size)}</td>
                <td>{fmtDate(b.created_at)}</td>
                <td>
                  <div className="row gap">
                    <a className="btn btn-ghost btn-sm" href={'/api/admin/backups/' + encodeURIComponent(b.name)}>Descargar</a>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(b.name)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <p className="muted small" style={{ marginTop: 12 }}>
        Los respaldos se guardan en <code>data/backups/</code>. Descarga una copia a otro equipo de vez en cuando.
      </p>
    </Section>
  )
}

function UsersCard({ onChanged = () => {} }) {
  const notify = useNotify()
  const { user: me } = useApp()
  const { data, loading, error } = useLoad(() => api.get('/users'), [])
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const pending = (data || []).filter((u) => u.pending_approval)
  const users = (data || []).filter((u) => !u.pending_approval)
  const admins = users.filter((u) => u.role === 'admin' && u.active).length

  async function save(e) {
    e.preventDefault(); setFormError('')
    try {
      await api.post('/users', editing)
      setEditing(null); onChanged(); notify('Usuario creado')
    } catch (err) { setFormError(err.message) }
  }

  async function approve(user) {
    try {
      await api.post('/admin/registrations/' + user.id + '/approve')
      onChanged(); notify(`${user.name} ya puede entrar`)
    } catch (err) { notify(err.message) }
  }

  async function reject(user) {
    confirmAction(`¿Rechazar la solicitud de ${user.name}? Se eliminará la cuenta.`, async () => {
      try {
        await api.post('/admin/registrations/' + user.id + '/reject')
        onChanged(); notify('Solicitud rechazada')
      } catch (err) { notify(err.message) }
    })
  }

  async function toggle(user) {
    try {
      await api.patch('/users/' + user.id, { active: !user.active })
      onChanged(); notify(user.active ? 'Usuario desactivado' : 'Usuario activado')
    } catch (err) { notify(err.message) }
  }

  async function changeRole(user) {
    try {
      await api.patch('/users/' + user.id, { role: user.role === 'admin' ? 'user' : 'admin' })
      onChanged(); notify('Rol actualizado')
    } catch (err) { notify(err.message) }
  }

  return (
    <Section title="Usuarios" subtitle="El super administrador aprueba solicitudes y administra las cuentas"
      actions={<Btn onClick={() => { setEditing({ ...blankUser }); setFormError('') }}>+ Nuevo usuario</Btn>}>

      {pending.length > 0 && (
        <div className="pending-box">
          <h3>Solicitudes pendientes ({pending.length})</h3>
          {pending.map((u) => (
            <div className="pending-row" key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <div className="muted small">{u.email} · {u.google_linked ? 'Google' : 'Correo'} · {fmtDate(u.created_at)}</div>
              </div>
              <div className="row gap">
                <Btn onClick={() => approve(u)}>Aprobar</Btn>
                <Btn variant="ghost" onClick={() => reject(u)}>Rechazar</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th><th>Telegram</th><th>Suscripción</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong>{u.active ? '' : ' (inactivo)'}</td>
              <td>{u.email}</td>
              <td>{u.role === 'admin'
                ? <Badge tone="purple">Super administrador</Badge>
                : <Badge tone="gray">Usuario</Badge>}</td>
              <td>{u.google_linked ? 'Google' : 'Correo'}</td>
              <td>{u.telegram_linked ? 'Vinculado' : '—'}</td>
              <td>{u.subscription_status || '—'}</td>
              <td>
                <div className="row gap">
                  {u.id !== me.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                  )}
                  {!(u.role === 'admin' && admins <= 1) && u.id !== me.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => changeRole(u)}>
                      {u.role === 'admin' ? 'Hacer usuario' : 'Hacer administrador'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {editing && (
        <Modal title="Nuevo usuario" onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            {formError && <ErrorBox message={formError} />}
            <Field label="Nombre"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></Field>
            <Field label="Correo"><input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required /></Field>
            <Field label="Teléfono"><input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="Contraseña temporal"><input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} minLength={6} required /></Field>
            <Field label="Rol" hint="El super administrador también puede configurar Telegram y respaldos.">
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                <option value="user">Usuario</option>
                <option value="admin">Super administrador</option>
              </select>
            </Field>
            <div className="row gap"><Btn type="submit">Crear</Btn><Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn></div>
          </form>
        </Modal>
      )}
    </Section>
  )
}

export default function Settings() {
  const { user, config } = useApp()
  const [version, setVersion] = useState(0)
  const isAdmin = user.role === 'admin'
  return (
    <div className="stack-lg">
      <Section title="Configuración" subtitle="Tu cuenta, notificaciones y acceso de otros usuarios">
        <div className="row gap wrap">
          <Badge tone={isAdmin ? 'purple' : 'gray'}>{roleLabel(user.role)}</Badge>
          <Badge tone={config.subscriptionsEnabled ? 'green' : 'gray'}>
            Suscripciones {config.subscriptionsEnabled ? 'activadas' : 'preparadas, desactivadas'}
          </Badge>
          {user.googleLinked && <Badge tone="blue">Cuenta de Google vinculada</Badge>}
        </div>
      </Section>
      <TelegramCard config={config} isAdmin={isAdmin} />
      <PasswordCard />
      {isAdmin && <AdminConfigCard key={'config-' + version} />}
      {isAdmin && <AdminStatusCard key={'status-' + version} />}
      {isAdmin && <BackupsCard />}
      {isAdmin && <UsersCard key={'users-' + version} onChanged={() => setVersion((v) => v + 1)} />}
      <Section title="Instalación en tu celular" subtitle="PWA: funciona como aplicación">
        <ol className="muted small">
          <li>Abre esta página en Chrome (Android) o Safari (iPhone).</li>
          <li>Menú del navegador → «Agregar a pantalla de inicio» / «Compartir → Agregar a Inicio».</li>
          <li>Se abre a pantalla completa y funciona con el service worker.</li>
        </ol>
      </Section>
    </div>
  )
}
