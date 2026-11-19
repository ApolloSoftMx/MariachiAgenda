// Crea un respaldo de la base sin detener el servidor. Uso: npm run backup
import 'dotenv/config'
import { createBackup, backupDir } from '../server/backup.js'

const backup = createBackup()
console.log(`Respaldo creado: ${backup.name}`)
console.log(`Carpeta: ${backupDir()}`)
