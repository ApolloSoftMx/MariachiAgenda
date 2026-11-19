// Genera el avatar cuadrado del bot de Telegram sin dependencias nativas.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const table = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function makePNG(size) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  const trumpet = [[.26, .70], [.26, .32], [.50, .56], [.74, .32], [.74, .70]]
  const thick = size * .082
  const sparkles = [[.15, .18, .012], [.86, .20, .010], [.14, .82, .009], [.88, .84, .011]]

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const i = y * stride + 1 + x * 4
      const nx = x / size, ny = y / size

      // Fondo degradado morado (mismo tono que la app).
      let r = Math.round(72 + nx * 38)
      let g = Math.round(28 + ny * 28)
      let b = Math.round(150 + nx * 55)

      // Anillo dorado circular que enmarca el avatar al recortarlo Telegram.
      const ring = Math.abs(Math.hypot(nx - .5, ny - .5) - .455)
      if (ring < .014) { r = 251; g = 191; b = 36 }

      // Trompeta / "M" blanca.
      let hit = false
      for (let s = 0; s < trumpet.length - 1; s++) {
        if (distToSegment(nx, ny, ...trumpet[s], ...trumpet[s + 1]) < thick / size) { hit = true; break }
      }
      if (hit && ring >= .014) { r = 255; g = 255; b = 255 }

      // Nota musical dorada.
      const cx = .80, cy = .72, rad = .075
      if (Math.hypot(nx - cx, ny - cy) < rad) { r = 251; g = 191; b = 36 }
      if (nx > .842 && nx < .882 && ny > .21 && ny < .72) { r = 251; g = 191; b = 36 }

      // Destellos dorados.
      for (const [sx, sy, sr] of sparkles) {
        if (Math.hypot(nx - sx, ny - sy) < sr) { r = 251; g = 191; b = 36 }
      }

      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const out = path.resolve(process.cwd(), 'public', 'telegram-bot-avatar.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, makePNG(512))
console.log('generado public/telegram-bot-avatar.png')
