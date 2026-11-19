import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api.js'
import { Field, Btn } from './ui.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Calendar from './pages/Calendar.jsx'
import Events from './pages/Events.jsx'
import EventForm from './pages/EventForm.jsx'
import Clients from './pages/Clients.jsx'
import Quotes from './pages/Quotes.jsx'
import Catalogs from './pages/Catalogs.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const NAV = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/calendario', label: 'Calendario', icon: '📅' },
  { to: '/eventos', label: 'Eventos', icon: '🎺' },
  { to: '/clientes', label: 'Clientes', icon: '👥' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: '📄' },
  { to: '/reportes', label: 'Finanzas', icon: '💰' },
  { to: '/catalogos', label: 'Catálogos', icon: '🎼' },
  { to: '/configuracion', label: 'Configuración', icon: '⚙️' }
]

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function Login({ config, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [error, setError] = useState(
    () => new URLSearchParams(window.location.search).get('auth_error') || ''
  )
  const [notice, setNotice] = useState(
    () => new URLSearchParams(window.location.search).get('auth_notice') || ''
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await api.post(mode === 'login' ? '/auth/login' : '/auth/register',
        mode === 'login' ? { email, password } : { name, email, password })
      if (data.pending) {
        setNotice(data.message || 'Solicitud enviada. Espera la aprobación del super administrador.')
        setMode('login')
        setPassword('')
        return
      }
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">🎺</div>
          <h1>MariachiTotal</h1>
          <p>Eventos, clientes y finanzas en un solo lugar</p>
        </div>
        {config.googleEnabled && (
          <>
            <a className="btn btn-google" href="/api/auth/google">
              <GoogleIcon /> Continuar con Google
            </a>
            <div className="login-divider"><span>o entra con tu correo</span></div>
          </>
        )}
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          )}
          <Field label="Correo">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Contraseña">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </Field>
          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-ok">{notice}</div>}
          <Btn type="submit" disabled={busy}>
            {busy ? 'Enviando…' : mode === 'login' ? 'Entrar' : 'Solicitar acceso'}
          </Btn>
        </form>
        {config.registrationEnabled && (
          <button className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice('') }}>
            {mode === 'login' ? '¿No tienes cuenta? Solicita acceso' : 'Ya tengo cuenta, iniciar sesión'}
          </button>
        )}
        {mode === 'register' && (
          <p className="muted small">El super administrador recibe tu solicitud y decide si te da acceso.</p>
        )}
        <p className="install-hint">Para instalar en tu celular: menú del navegador → «Agregar a pantalla de inicio».</p>
      </div>
    </div>
  )
}

function Layout({ user, config, notify, logout }) {
  const location = useLocation()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon">🎺</span><span>MariachiTotal</span></div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{user.name?.slice(0, 1).toUpperCase()}</div>
          <div className="sidebar-user"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Super administrador' : 'Usuario'}</small></div>
          <button className="icon-btn" onClick={logout} title="Cerrar sesión">↪</button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-icon">🎺</span>
            <strong>MariachiTotal</strong>
          </div>
          <div className="topbar-actions">
            <NavLink to="/eventos/nuevo" className="btn btn-primary btn-sm">+ Evento</NavLink>
            <span className="topbar-user">{user.name}</span>
          </div>
        </header>
        <main className="content" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendario" element={<Calendar />} />
            <Route path="/eventos" element={<Events />} />
            <Route path="/eventos/nuevo" element={<EventForm />} />
            <Route path="/eventos/:id" element={<EventForm />} />
            <Route path="/clientes" element={<Clients />} />
            <Route path="/cotizaciones" element={<Quotes />} />
            <Route path="/catalogos" element={<Catalogs />} />
            <Route path="/reportes" element={<Reports />} />
            <Route path="/configuracion" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="bottom-nav">
          {[
            NAV[0], NAV[2], NAV[3], NAV[4],
            { to: '/configuracion', label: 'Más', icon: '⚙️' }
          ].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => 'bottom-item' + (isActive ? ' active' : '')}>
              <span>{item.icon}</span><small>{item.label}</small>
            </NavLink>
          ))}
        </nav>
      </div>
      {notify && <div className="toast">{notify}</div>}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [config, setConfig] = useState({})
  const [notify, setNotify] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/config'),
      api.get('/auth/me').catch(() => null)
    ]).then(([cfg, me]) => {
      setConfig(cfg || {})
      setUser(me?.user || null)
    }).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener('auth:expired', expired)
    return () => window.removeEventListener('auth:expired', expired)
  }, [])

  function showNotification(message) {
    setNotify(message)
    setTimeout(() => setNotify(''), 2800)
  }

  async function refreshConfig() {
    try {
      const cfg = await api.get('/config')
      setConfig(cfg || {})
      return cfg
    } catch {
      return null
    }
  }

  async function refreshUser() {
    try {
      const me = await api.get('/auth/me')
      const next = me?.user || null
      setUser(next)
      return next
    } catch {
      return null
    }
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => {})
    setUser(null)
  }

  const value = { user, config, notify: showNotification, refreshConfig, refreshUser }

  if (user === undefined) return <div className="splash">🎺<span>Cargando agenda…</span></div>
  if (!user) return <Login config={config} onLogin={setUser} />

  return (
    <AppCtx.Provider value={value}>
      <BrowserRouter>
        <Layout user={user} config={config} notify={notify} logout={logout} />
      </BrowserRouter>
    </AppCtx.Provider>
  )
}
