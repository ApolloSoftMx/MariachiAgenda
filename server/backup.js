import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'

const pad = (n) => String(n).padStart(2, '0')

export function backupDir() {
  return process.env.BACKUP_DIR
    ? path.resolve(process.cwd(), process.env.BACKUP_DIR)
    : path.resolve(process.cwd(), 'data/backups')
}

const stamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const safeName = (name) => /^agenda-\d{8}-\d{6}(-\d+)?\.db$/.test(String(name || ''))

export function listBackups() {
  const dir = backupDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(safeName)
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name))
      return { name, size: stat.size, created_at: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

export function createBackup() {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const base = `agenda-${stamp()}`
  let name = `${base}.db`
  let n = 1
  while (fs.existsSync(path.join(dir, name))) name = `${base}-${n++}.db`
  const file = path.join(dir, name)
  // VACUUM INTO crea una copia consistente aunque el servidor esté en uso.
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const stat = fs.statSync(file)
  return { name, size: stat.size, created_at: stat.mtime.toISOString() }
}

export function backupPath(name) {
  if (!safeName(name)) return null
  const file = path.join(backupDir(), name)
  return fs.existsSync(file) ? file : null
}

export function removeBackup(name) {
  const file = backupPath(name)
  if (!file) return false
  fs.rmSync(file, { force: true })
  return true
}
