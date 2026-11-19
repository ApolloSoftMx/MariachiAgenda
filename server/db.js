import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword } from './auth.js'

const dataDir = path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })
export const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(dataDir, 'agenda.db')

export const db = new DatabaseSync(dbPath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`)

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  phone TEXT,
  google_id TEXT,
  avatar_url TEXT,
  telegram_chat_id TEXT UNIQUE,
  telegram_link_code TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  pending_approval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'own',
  responsable TEXT,
  color TEXT NOT NULL DEFAULT '#7c3aed',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank',
  details TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS musicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  default_payment REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  band_id INTEGER REFERENCES bands(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'leader',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  location_name TEXT,
  address TEXT,
  maps_url TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  tandas INTEGER NOT NULL DEFAULT 0,
  rate_per_tanda REAL NOT NULL DEFAULT 0,
  musicians_planned INTEGER NOT NULL DEFAULT 0,
  charged_amount REAL NOT NULL DEFAULT 0,
  advance_amount REAL NOT NULL DEFAULT 0,
  advance_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id);

CREATE TABLE IF NOT EXISTS event_musicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  musician_id INTEGER REFERENCES musicians(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  payment_per_tanda REAL NOT NULL DEFAULT 0,
  payment_amount REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_em_event ON event_musicians(event_id);

-- Invitaciones públicas: cada enlace tiene un pago por tanda propio y registra
-- quién confirmó o rechazó, sin revelar importes en la página del músico.
CREATE TABLE IF NOT EXISTS event_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  rate_per_tanda REAL NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invite_event ON event_invites(event_id);

CREATE TABLE IF NOT EXISTS event_invite_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id INTEGER NOT NULL REFERENCES event_invites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('confirmed', 'declined')),
  event_musician_id INTEGER REFERENCES event_musicians(id) ON DELETE SET NULL,
  owns_event_musician INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(invite_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_invite_response_invite ON event_invite_responses(invite_id);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_monthly REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'trialing',
  current_period_end TEXT,
  provider TEXT,
  provider_ref TEXT
);

CREATE TABLE IF NOT EXISTS telegram_notifications (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id, kind)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL DEFAULT '',
  event_time TEXT NOT NULL DEFAULT '19:00',
  location_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tandas INTEGER NOT NULL DEFAULT 0,
  rate_per_tanda REAL NOT NULL DEFAULT 0,
  musicians_planned INTEGER NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  deposit_amount REAL NOT NULL DEFAULT 0,
  valid_until TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  deposit_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  deposit_details TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  share_token TEXT NOT NULL UNIQUE,
  receipt_name TEXT NOT NULL DEFAULT '',
  receipt_mime TEXT NOT NULL DEFAULT '',
  receipt_path TEXT NOT NULL DEFAULT '',
  accepted_at TEXT,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
`)

// Migraciones idempotentes para bases ya creadas.
const eventColumns = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name)
if (!eventColumns.includes('musicians_planned')) {
  db.exec('ALTER TABLE events ADD COLUMN musicians_planned INTEGER NOT NULL DEFAULT 0')
}
if (!eventColumns.includes('tandas')) {
  db.exec('ALTER TABLE events ADD COLUMN tandas INTEGER NOT NULL DEFAULT 0')
}
if (!eventColumns.includes('rate_per_tanda')) {
  db.exec('ALTER TABLE events ADD COLUMN rate_per_tanda REAL NOT NULL DEFAULT 0')
}

const eventMusicianColumns = db.prepare('PRAGMA table_info(event_musicians)').all().map((c) => c.name)
if (!eventMusicianColumns.includes('payment_per_tanda')) {
  db.exec('ALTER TABLE event_musicians ADD COLUMN payment_per_tanda REAL NOT NULL DEFAULT 0')
}

const inviteResponseColumns = db.prepare('PRAGMA table_info(event_invite_responses)').all().map((c) => c.name)
if (!inviteResponseColumns.includes('owns_event_musician')) {
  db.exec('ALTER TABLE event_invite_responses ADD COLUMN owns_event_musician INTEGER NOT NULL DEFAULT 0')
}

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
if (!userColumns.includes('google_id')) db.exec('ALTER TABLE users ADD COLUMN google_id TEXT')
if (!userColumns.includes('avatar_url')) db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT')
if (!userColumns.includes('pending_approval')) {
  db.exec('ALTER TABLE users ADD COLUMN pending_approval INTEGER NOT NULL DEFAULT 0')
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_id) WHERE google_id IS NOT NULL')

const quoteColumns = db.prepare('PRAGMA table_info(quotes)').all().map((c) => c.name)
for (const column of ['location_name', 'address', 'maps_url', 'event_time', 'receipt_name', 'receipt_mime', 'receipt_path']) {
  if (!quoteColumns.includes(column)) {
    db.exec(`ALTER TABLE quotes ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`)
  }
  if (column === 'event_time') {
    db.exec("UPDATE quotes SET event_time = '19:00' WHERE event_time = '' OR event_time IS NULL")
  }
}
if (!quoteColumns.includes('tandas')) {
  db.exec('ALTER TABLE quotes ADD COLUMN tandas INTEGER NOT NULL DEFAULT 0')
}
if (!quoteColumns.includes('rate_per_tanda')) {
  db.exec('ALTER TABLE quotes ADD COLUMN rate_per_tanda REAL NOT NULL DEFAULT 0')
}
if (!quoteColumns.includes('deposit_amount')) {
  db.exec('ALTER TABLE quotes ADD COLUMN deposit_amount REAL NOT NULL DEFAULT 0')
}
if (!quoteColumns.includes('accepted_at')) {
  db.exec('ALTER TABLE quotes ADD COLUMN accepted_at TEXT')
}
if (!quoteColumns.includes('event_id')) {
  db.exec('ALTER TABLE quotes ADD COLUMN event_id INTEGER REFERENCES events(id) ON DELETE SET NULL')
}

// Roles del sistema: admin (super administrador) y user (usuario final).
db.exec("UPDATE users SET role = 'admin' WHERE role = 'owner'")
db.exec("UPDATE users SET role = 'user' WHERE role = 'member'")

db.prepare(`INSERT OR IGNORE INTO plans (code, name, price_monthly) VALUES (?, ?, ?)`).run('free', 'Free', 0)
db.prepare(`INSERT OR IGNORE INTO plans (code, name, price_monthly) VALUES (?, ?, ?)`).run('mariachi', 'Mariachi Pro', 199)

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
if (userCount === 0) {
  const email = process.env.SEED_ADMIN_EMAIL || process.env.SEED_OWNER_EMAIL || 'owner@agenda.local'
  const name = process.env.SEED_ADMIN_NAME || process.env.SEED_OWNER_NAME || 'Super administrador'
  const password = process.env.SEED_ADMIN_PASSWORD || process.env.SEED_OWNER_PASSWORD
    || crypto.randomBytes(9).toString('base64url')
  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
    .run(name, email, hashPassword(password))
  db.prepare(`INSERT INTO subscriptions (user_id, plan_id, status) SELECT id, NULL, 'active' FROM users WHERE email = ?`).run(email)
  if (!process.env.SEED_ADMIN_PASSWORD && !process.env.SEED_OWNER_PASSWORD) {
    console.warn('\n[agenda] Super administrador creado: ' + email)
    console.warn('[agenda] Contraseña temporal (cámbiala en Configuración): ' + password + '\n')
  }
}

export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const one = (sql, ...params) => db.prepare(sql).get(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)
