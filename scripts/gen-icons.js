// Genera los íconos PNG del PWA sin dependencias nativas.
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
  const pts = [[.24, .70], [.24, .30], [.50, .55], [.76, .30], [.76, .70]]
  const thick = size * .085
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const i = y * stride + 1 + x * 4
      const nx = x / size, ny = y / size
      let r = Math.round(90 + nx * 25), g = Math.round(35 + ny * 25), b = Math.round(190 + nx * 35)
      let hit = false
      for (let s = 0; s < pts.length - 1; s++) {
        if (distToSegment(nx, ny, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]) < thick / size) { hit = true; break }
      }
      if (hit) { r = 255; g = 255; b = 255 }
      const cx = .80, cy = .72, rad = .07
      if (Math.hypot(nx - cx, ny - cy) < rad) { r = 251; g = 191; b = 36 }
      if (nx > .84 && nx < .875 && ny > .22 && ny < .72) { r = 251; g = 191; b = 36 }
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

const outDir = path.resolve(process.cwd(), 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), makePNG(size))
  console.log('generado public/icons/icon-' + size + '.png')
}
