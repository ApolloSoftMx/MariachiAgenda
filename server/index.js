import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { createApp } from './app.js'
import { startBot } from './bot.js'

const config = { botUsername: process.env.BOT_USERNAME || '' }
const app = createApp(config)
const dist = path.resolve(process.cwd(), 'dist')

if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { maxAge: '1h' }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.type('html').send('<h1>Agenda Mariachi</h1><p>API activa. Ejecuta <code>npm run build</code> para servir la interfaz.</p>')
  })
}

const port = Number(process.env.PORT || 3000)
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[agenda] servidor en http://localhost:${port}`)
  console.log(`[agenda] base de datos: ${process.env.DB_PATH || './data/agenda.db'}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}

startBot(config)
