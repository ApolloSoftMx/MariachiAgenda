# AGENTS.md

Mariachi agenda + clients + finances app. React PWA (`client/`) on an Express API (`server/`) with SQLite via the built-in `node:sqlite` (no native deps). UI copy and API errors are in Spanish; keep them that way.

Product and visual truth live in `PRODUCT.md` and `DESIGN.md` (plus `.impeccable/design.json`) for the Impeccable skill at `.opencode/skills/impeccable/`; keep them in sync when changing the UI.

## Commands

```bash
npm install
npm run dev      # API on :3000 (watch) + Vite on :5173, Vite proxies /api
npm run build    # PWA -> dist/
npm start        # serves API + dist/ with SPA fallback on :3000
npm test         # API smoke test (scripts/smoke.mjs, 93 checks)
npm run backup   # creates data/backups/agenda-*.db via VACUUM INTO
npm run transfer # reassign created_by rows: --from EMAIL --to EMAIL [--promote] [--apply]
npm run icons    # regenerate public/icons/*.png
```

Ports come from `.env`: `PORT` (API + built app, default 3000) and `VITE_PORT` (dev web, default 5173). Vite reads `PORT` for its `/api` proxy, and `iniciar.bat` reads `PORT` to open the browser at the right URL.

Windows helpers: `iniciar.bat` (install/build/start + open browser) and `respaldar.bat` (backup). PowerShell execution policy blocks `npm.ps1`, so use `& 'C:\Program Files\nodejs\npm.cmd' <script>`.

`npm start` only serves the UI if `dist/` exists, so run `npm run build` first. Dev uses Vite, production uses `dist/`. Only one port is exposed (`PORT`, 3000 by default); the frontend calls the API same-origin at `/api`, so no separate API URL is needed.

## Architecture

- `server/index.js` — bootstraps HTTP, static `dist/`, bot.
- `server/app.js` — every `/api` route, Zod validation, event/report logic, Google OAuth.
- `server/db.js` — idempotent schema/migrations, seed (admin + plans), `all/one/run` helpers.
- `server/auth.js` — scrypt hashes, `agenda_sid` cookie sessions, `requireAuth`/`requireAdmin`, subscription guard.
- `server/backup.js` — `listBackups`/`createBackup`/`backupPath`/`removeBackup` under `data/backups` (override with `BACKUP_DIR`). `scripts/transfer-ownership.mjs` uses `createBackup()` before a `BEGIN IMMEDIATE` transaction to reassign `created_by` rows between users (dry-run unless `--apply`).
- `server/settings.js` — key/value settings table; screen-saved values take priority over env vars.
- `server/events.js` — shared event queries/save helper used by the web API and Telegram bot. `server/musicians.js` normalizes phones and reuses catalog rows for public invitations.
- `server/pdf.js` — dependency-free PDF generator for quotes (Helvetica/WinAnsi).
- `server/bot.js` — grammy long polling, link codes, reminders, admin approve/reject callbacks, guided `/nuevo` (with `/cancelar` and a cancel button at every step), quick `/evento`, and option replies for empty/unknown commands.
- `client/src/App.jsx` — auth gate, layout, routes, Google login button. `pages/` holds each view (including `Quotes.jsx`). `api.js` holds fetch helpers, `useLoad`, money/date formatters; `quote.js` builds share links and PNG downloads; `eventShare.js` builds event/invite/per-musician messages and `wa.me` links (pure, no DOM) and `EventShareButton.jsx` renders the share/invite modal in the event list/detail. `theme.jsx` provides light/dark/system theme via `localStorage` key `mariachitotal-theme` and `data-theme` on `<html>` (bootstrapped inline in root `index.html` to avoid flash); tokens live in `client/src/styles.css`.
- DB file: `data/agenda.db` (auto-created). `data/` and `.env` are gitignored — never commit them.

## Two role levels (do not mix them)

- **System role** (`users.role`): `admin` = super administrador (users, registration approval, bot/Google config, backups, always bypasses subscriptions); `user` = usuario final. The admin role is **not a fixed email**: the first admin is seeded, others can be promoted from Settings, and at least one active admin must remain. Legacy values `owner`/`member` are migrated to `admin`/`user` on DB open.
- **Event role** (`events.role`): `leader` (my group) or `guest` (another leader invited me). A user can be leader on one event and guest on another. Derived from `bands.kind` on save (`own` → `leader`, `guest` → `guest`); the client also derives it in the form.

## Registration + approval

- Open registration (`ALLOW_REGISTRATION`, default true) creates users with `active = 0, pending_approval = 1`; they get no session and cannot log in.
- `GET /api/users` exposes `pending_approval`. Admins approve via `POST /api/admin/registrations/:id/approve` (sets active, clears pending) or reject via `.../reject` (deletes the user).
- New Google accounts follow the same pending flow unless `ALLOW_GOOGLE_SIGNUP=false`. Existing approved Google accounts log in normally.
- If the bot is running and an admin has linked Telegram, `notifyAdminsAboutRegistration` sends inline **Aprobar/Rechazar** buttons. The bot callback re-checks that the Telegram chat belongs to an active admin. `/pendientes` lists pending requests; with none, it replies with the available commands instead of staying silent.

## User management (Configuración → Usuarios)

- `GET /api/users` is admin-only and returns all rows (pending included), sorted pending first. The UI shows **every** user in one table — the old version hid pending users in a separate box and had no literal «Aceptar usuario» button; that button now calls the approve route.
- `POST /api/admin/users/:id/reset-password` generates a random base64url password (12 chars) with `hashPassword()` and returns it in the response only. The UI shows it once in a modal with a copy button. Google-only accounts have an unusable random hash, so reset hides that option for them (they can still use the manual «Contraseña» action).
- `POST /api/admin/users/:id/authorize` sets `active = 1, pending_approval = 0` and upserts `subscriptions` to `status = 'active', current_period_end = NULL`. This is the UI answer to «aceptar suscripción»: there is no billing/plan-change flow. It is shown when the account is inactive or a non-admin has a status outside `active|trialing`.
- `PATCH /api/users/:id` now accepts `password` from the UI (hash with `hashPassword`) and also edits `name/email/phone/role/active`. Self-demotion and self-deactivation are blocked in the API, not just the UI. The last-active-admin guard still applies.
- Admin cannot revoke their own session this way; `DELETE /api/users/:id` already had a self-check.
- `scripts/transfer-ownership.mjs` reassigns `created_by` in `bands`, `clients`, `musicians`, `events`, `event_invites`, `expenses`, `quotes` from one email to another. It never deletes the source user, activates + authorizes the target, optionally promotes it to admin, and creates a backup first. `accounts` has no owner, so it is intentionally untouched.

## Non-obvious invariants

- Dates are stored as **local** strings `YYYY-MM-DDTHH:mm`, compared lexicographically. Do not use `toISOString().slice(...)` for local filters/report defaults — it shifts the date in non-UTC zones. Use `localDate`/`nowStamp` helpers.
- `tandas` (hours, 1–48) exist on both `events` and `quotes`. Each tanda = 1 hour; `saveEvent()` computes `ends_at = starts_at + tandas` (local time) via `server/datetime.js`, and quote share/PDF/PNG show `Fin estimado`. When a quote is accepted, its `tandas` carry into the created event. Forms also compute the end client-side for immediate feedback.
- `eventColors()` in `server/events.js` adds `event_color` to event rows: `guest` events use the `guest_color` setting (env `GUEST_EVENT_COLOR`, fallback `#e11d48`), own events use `bands.color` (fallback `#7c3aed`). The setting is editable at `PATCH /api/admin/config` and exposed via `/api/config`.
- `events.rate_per_tanda` (what you get paid as a guest, or client price as leader) and `event_musicians.payment_per_tanda` (per-musician rate) are stored alongside editable totals. `saveEvent()` only derives `charged_amount`/`payment_amount` from rate × tandas when the explicit total is missing; the UI always sends the total so manual overrides survive. `quotes.rate_per_tanda` carries into the accepted event.
- `events.musicians_planned` is a manual headcount independent of the listed `event_musicians` rows; payments and paid totals come only from those rows.
- `PATCH /api/events/:id` replaces the **entire** `musicians` array (send the full list) and re-inserts rows in a transaction.
- Rows with no `musician_id` (captured as free text in the form) are auto-added to the shared `musicians` catalog by `saveEvent()` in the same transaction, linking the event row to the new/existing catalog ID. Names are matched with `TRIM(name) COLLATE NOCASE` to avoid duplicates, `default_payment` takes the musician's payment (or per-tanda rate), and `created_by` comes from the event owner. Send `catalog_new_musicians: false` to skip this; the event form exposes it as a checkbox. This also applies to PATCH (the route now passes `req.user.id` to `saveEvent()`).
- Report profit = `charged − paid-to-musicians (paid=1) − expenses`, excluding `cancelled` events. Advance is not subtracted again.
- Auth: admin bypasses subscriptions; users are gated only when `ENABLE_SUBSCRIPTIONS=true`. Login is rate-limited (10/10 min per IP+email). Pending users get a distinct 403 message.
- Data visibility: admins see all events/quotes/expenses/reports; non-admin users only see rows where `created_by = user.id`. `canAccess()` guards event/quote/expense detail, PATCH and DELETE. `listEvents({ viewer })` applies the same filter; reports and bot commands/reminders follow it too. Clients/musicians/bands/accounts are still shared catalogs.
- Quotes live in `quotes` with a unique `share_token` and optional `location_name`/`address`/`maps_url`. `server/pdf.js` `mapsForQuote()` derives a Google Maps search URL from address + location when `maps_url` is empty. `GET /api/quotes/:id/share` returns `publicUrl`, `pdfUrl`, `mapsUrl`, the Spanish WhatsApp `message` and `whatsappUrl` (`wa.me/<52+phone>?text=...`). No WhatsApp API is used — the UI only opens `wa.me` and copies text. `wa.me` cannot attach files, so the PDF/PNG are shared by link or downloaded manually.
- Public quote pages are `/q/:token` and `/q/:token.pdf`; they need no session. Vite PWA `navigateFallbackDenylist` excludes `/q/` so installed clients do not get the SPA shell instead of a quote. The public page also accepts a deposit receipt: `POST /q/:token/accept` takes a raw PNG/JPG/WebP/PDF body (≤10 MB, MIME + magic checked), saves it under `data/<db-name>-receipts/`, sets `quotes.status = accepted`, and creates a confirmed event with `created_by = quote.created_by` using `event_time` (default 19:00) and `deposit_amount` as `advance_amount`. `GET /q/:token/receipt` serves it by token. Already-accepted quotes return 409.
- Event invitations live in `event_invites` (token + `rate_per_tanda` + creator) and `event_invite_responses` (name, phone, status, linked `event_musician_id`, `owns_event_musician`). `POST /api/events/:id/invites` creates an invite for an event the user can access; `GET /api/events/:id/invites` lists invites and responses with `payment_per_tanda`/`payment_amount` from the linked event musician. Public `/e/:token` renders a no-session HTML form (no payment info) and `POST /e/:token/respond` accepts `{ name, phone, status: confirmed|declined }`. Confirmation reuses a catalog musician by normalized phone (`server/musicians.js` prepends `52` to 10-digit numbers), inserts the event musician with invite rate × event tandas, and links it to the response. `owns_event_musician` marks rows created by the invite so a later decline deletes only those; declines never delete manually added rows. `eventShare.js` builds emoji-rich, line-separated messages: the invite has no names/amounts and no confirmation wording, while `buildMusicianMessage()` adds the full event data plus that confirmed musician's name and `payment_per_tanda`/`payment_amount` from their event row (the «Enviar a músicos confirmados» section, driven by `GET /api/events/:id/invites` responses); `buildConfirmationMessage()` remains for the «Respuestas» panel. Vite PWA denylist also excludes `/e/`.
- Screen configuration lives in the `settings` table (`server/settings.js`): `setting(key, envName, fallback)` prefers the stored value, then env, then fallback. Bot token/username, Google client ID/secret, `allow_registration`, and `allow_google_signup` can be edited at `GET/PATCH /api/admin/config`; saving a bot token calls `restartBot()`. `bot_username` is auto-saved when the bot starts.
- Google OAuth is manual (no extra dependency): `/api/auth/google` sets a short-lived httpOnly `agenda_oauth_state` cookie and redirects to Google; `/api/auth/google/callback` validates `state`, exchanges the code at `oauth2.googleapis.com/token`, reads `oauth2/v3/userinfo`, then links by `google_id`/email or creates a pending `user` (unless `ALLOW_GOOGLE_SIGNUP=false`). Redirect URI defaults to `${APP_URL}/api/auth/google/callback`, falling back to the request host. Google-only accounts get a random unusable password hash because `users.password_hash` is NOT NULL.
- Cookie is `Secure` only when `APP_URL` starts with `https://` (Cloudflare Tunnel).
- Bot is optional: empty bot token disables it without affecting the web. Token comes from `settings` first, then `BOT_TOKEN`. Link flow is web generates a code → the Settings UI opens `https://t.me/<bot>?start=CODE` automatically (browser cannot send a Telegram message itself, so the deep link pre-fills `/start CODE` and the user confirms in Telegram) and copies `/start CODE` as fallback. Any active linked user can create events with guided `/nuevo` (in-memory draft keyed by chat ID, abortable with `/cancelar` or the inline cancel button) or one-line `/evento`; drafts call `saveEvent()` from `server/events.js` with `created_by` set to that user. Reminders run every 2 min and dedupe via `telegram_notifications`. Registration notices require the admin to have linked Telegram; without a bot, approvals still work from the web.
- Backups use `VACUUM INTO` while the DB is open, so they are consistent without stopping the server. Filenames must match `agenda-YYYYMMDD-HHMMSS(-n).db`; route handlers reject anything else.
- `npm test` starts the app on an ephemeral port with `data/smoke.db` and `data/smoke-backups`, closes the DB, and removes the temp files. It sets its own env before importing modules.

## Deploy

Local server exposed through `cloudflared tunnel --url http://localhost:3000`. Set `APP_URL` to the public HTTPS URL, then restart. The same URL must be registered as the Google OAuth redirect URI. See `README.md` for named tunnels, Telegram/Google setup, and backups.
