// Tiny static server for the dzz film: the site at /, the film folder at /film/, /app -> app.html.
// usage: node film/serve.mjs [port=47823]   (stop it when done)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const FILM = path.dirname(fileURLToPath(import.meta.url)), SITE = path.join(FILM, '..')
const PORT = +(process.argv[2] || 47823)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webp': 'image/webp' }
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file
  if (p.startsWith('/film/')) file = path.join(FILM, p.slice(6))
  else { if (p === '/') p = '/index.html'; if (p === '/app') p = '/app.html'; file = path.join(SITE, p) }
  if (!file.startsWith(FILM) && !file.startsWith(SITE)) { res.writeHead(403); return res.end() }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404') }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf)
  })
}).listen(PORT, '127.0.0.1', () => console.log('serving on', PORT))
