import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const KEY = 'mariachitotal-theme'
const AppThemeCtx = createContext(null)

export const THEME_OPTIONS = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' }
]

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function readStored() {
  try {
    const value = localStorage.getItem(KEY)
    return THEME_OPTIONS.some((o) => o.value === value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function resolve(mode) {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

export function applyTheme(mode) {
  const resolved = resolve(mode)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
    resolved === 'dark' ? '#14121d' : '#6d28d9')
  return resolved
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStored)
  const [resolved, setResolved] = useState(() => resolve(readStored()))

  useEffect(() => {
    setResolved(applyTheme(mode))
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => { if (mode === 'system') setResolved(applyTheme(mode)) }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [mode])

  const value = useMemo(() => ({
    mode,
    resolved,
    setMode(next) {
      const safe = THEME_OPTIONS.some((o) => o.value === next) ? next : 'system'
      try { localStorage.setItem(KEY, safe) } catch { /* almacenamiento no disponible */ }
      setModeState(safe)
    }
  }), [mode, resolved])

  return <AppThemeCtx.Provider value={value}>{children}</AppThemeCtx.Provider>
}

export function useTheme() {
  return useContext(AppThemeCtx) || { mode: 'system', resolved: 'light', setMode: () => {} }
}

const ICONS = { light: '☀', dark: '☾', system: '◐' }

export function ThemeToggle({ className = '' }) {
  const { mode, setMode } = useTheme()
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
  const label = THEME_OPTIONS.find((o) => o.value === mode)?.label || 'Sistema'
  return (
    <button type="button"
      className={'icon-btn theme-toggle ' + className}
      onClick={() => setMode(next)}
      title={`Tema: ${label}. Cambiar a ${THEME_OPTIONS.find((o) => o.value === next).label.toLowerCase()}`}
      aria-label={`Tema actual: ${label}. Cambiar tema`}>
      <span aria-hidden="true">{ICONS[mode]}</span>
    </button>
  )
}

export function ThemeSelector() {
  const { mode, setMode } = useTheme()
  return (
    <div className="segmented" role="group" aria-label="Tema de la aplicación">
      {THEME_OPTIONS.map((option) => (
        <button key={option.value} type="button"
          className={mode === option.value ? 'active' : ''}
          aria-pressed={mode === option.value}
          onClick={() => setMode(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}
