import { one, run } from './db.js'

export function getSetting(key) {
  const row = one('SELECT value FROM settings WHERE key = ?', key)
  return row ? row.value : null
}

export function setSetting(key, value) {
  run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    key, String(value ?? ''))
}

export function deleteSetting(key) {
  run('DELETE FROM settings WHERE key = ?', key)
}

// Prioridad: valor guardado desde la pantalla > variable de entorno > valor por defecto.
export function setting(key, envName, fallback = '') {
  const stored = getSetting(key)
  if (stored !== null) return stored
  const envValue = envName ? process.env[envName] : undefined
  return envValue !== undefined && envValue !== '' ? envValue : fallback
}

export function boolSetting(key, envName, fallback = false) {
  const value = setting(key, envName, fallback ? 'true' : 'false')
  return value === 'true' || value === '1'
}
