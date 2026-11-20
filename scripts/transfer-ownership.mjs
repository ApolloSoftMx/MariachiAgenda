// Traspasa los registros creados por un usuario a otro. Uso:
//   npm run transfer -- --from owner@correo.com --to nuevo@correo.com [--promote] [--apply]
// Sin --apply solo muestra el informe (simulación).
import { one, run, db, dbPath } from '../server/db.js'
import { createBackup } from '../server/backup.js'

const TABLES = ['bands', 'clients', 'musicians', 'accounts', 'events', 'event_invites', 'expenses', 'quotes']

const usage = `Uso:
  npm run transfer -- --from CORREO_ORIGEN --to CORREO_DESTINO [--promote] [--apply]

Opciones:
  --from    Correo del usuario que creó los datos (por defecto owner@agenda.local).
  --to      Correo del usuario que recibirá los datos.
  --promote Además, convierte al usuario destino en super administrador.
  --apply   Ejecuta el cambio. Sin esta opción solo hace una simulación.
  --help    Muestra esta ayuda.

El destino queda activo y con suscripción activa. Se trasladan todos los catálogos
(clientes, músicos, agrupaciones y cuentas bancarias) junto con eventos, cotizaciones
y gastos. Las sesiones y notificaciones de Telegram no se mueven: pertenecen a cada
usuario.`

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--promote') args.promote = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--from' || arg === '--to') {
      const value = argv[++i]
      if (!value) throw new Error(`Falta el valor de ${arg}`)
      args[arg.slice(2)] = value
    } else throw new Error(`Opción desconocida: ${arg}`)
  }
  return args
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (err) {
  console.error(err.message + '\n\n' + usage)
  process.exit(1)
}

if (args.help) {
  console.log(usage)
  process.exit(0)
}
if (!args.from || !args.to) {
  console.error('Faltan --from y --to.\n\n' + usage)
  process.exit(1)
}

const from = one('SELECT id, name, email, role FROM users WHERE email = ? COLLATE NOCASE', args.from)
const to = one('SELECT id, name, email, role FROM users WHERE email = ? COLLATE NOCASE', args.to)
if (!from) throw new Error(`No existe el usuario de origen: ${args.from}`)
if (!to) throw new Error(`No existe el usuario de destino: ${args.to}`)
if (from.id === to.id) throw new Error('El usuario de origen y destino debe ser distinto')

const counts = TABLES.map((table) => ({
  table,
  n: one(`SELECT COUNT(*) AS n FROM ${table} WHERE created_by = ?`, from.id).n
}))
const total = counts.reduce((sum, row) => sum + row.n, 0)

console.log(`Base de datos: ${dbPath}`)
console.log(`Origen: ${from.name} <${from.email}> (id ${from.id}, ${from.role})`)
console.log(`Destino: ${to.name} <${to.email}> (id ${to.id}, ${to.role})`)
console.log('\nRegistros que cambiarían de dueño:')
for (const row of counts) console.log(`  ${row.table.padEnd(14)} ${row.n}`)
console.log(`  ${'TOTAL'.padEnd(14)} ${total}`)
console.log('\nNota: la app es personal. Los catálogos son privados: al cambiar created_by,')
console.log('      el usuario de destino ve esos registros y el de origen deja de verlos.')

if (!total) {
  console.log('\nNo hay registros para trasladar.')
  db.close()
  process.exit(0)
}

if (!args.apply) {
  console.log('\nMODO SIMULACIÓN: no se cambió nada. Vuelve a ejecutar con --apply para aplicar.')
  db.close()
  process.exit(0)
}

const backup = createBackup()
console.log(`\nRespaldo creado: ${backup.name}`)

db.exec('BEGIN IMMEDIATE')
try {
  for (const { table } of counts) {
    run(`UPDATE ${table} SET created_by = ? WHERE created_by = ?`, to.id, from.id)
  }
  run('UPDATE users SET active = 1, pending_approval = 0 WHERE id = ?', to.id)
  if (one('SELECT user_id FROM subscriptions WHERE user_id = ?', to.id)) {
    run("UPDATE subscriptions SET status = 'active', current_period_end = NULL WHERE user_id = ?", to.id)
  } else {
    run("INSERT INTO subscriptions (user_id, status) VALUES (?, 'active')", to.id)
  }
  if (args.promote) run("UPDATE users SET role = 'admin' WHERE id = ?", to.id)
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  throw err
}

console.log(`Listo: ${total} registros fueron asignados a ${to.name}.`)
if (args.promote) console.log(`${to.name} ahora es super administrador.`)
console.log('El usuario de origen conserva su cuenta; no se borró ni se desactivó.')
db.close()
