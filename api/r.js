// The launcher's one server call on the hosted dzz: upload (the coin's picture + metadata JSON), kept for good in Vercel
// Blob (public, CDN-served). Needs a Blob store connected to the project (env BLOB_READ_WRITE_TOKEN).
import { put } from '@vercel/blob'
import crypto from 'node:crypto'

export const config = { api: { bodyParser: { sizeLimit: '3mb' } } }
const link = (x) => (/^https:\/\/\S{3,200}$/.test(String(x || '')) ? String(x) : '')

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  if (req.query.path !== 'upload' || req.method !== 'POST') return res.status(404).json({ error: 'unknown' })
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'storage is not connected yet (Vercel: Storage → Blob → connect to this project)' })
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const name = String(b.name || '').trim().slice(0, 32), symbol = String(b.symbol || '').trim().replace(/^\$+/, '').slice(0, 10)
    if (!name || !symbol) return res.status(400).json({ error: 'name and ticker are required' })
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'tickers are 1 to 10 letters or digits' })
    const m = String(b.image || '').match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/)
    if (!m) return res.status(400).json({ error: 'the picture must be png, jpg, webp or gif' })
    const bytes = Buffer.from(m[2], 'base64'); if (bytes.length > 1_900_000) return res.status(400).json({ error: 'the picture is too large (max 1.9 MB)' })
    const id = crypto.randomBytes(10).toString('hex'), ext = m[1] === 'jpeg' ? 'jpg' : m[1]
    const pic = await put(`i/${id}.${ext}`, bytes, { access: 'public', contentType: `image/${m[1]}`, addRandomSuffix: false, cacheControlMaxAge: 31536000 })
    const json = { name, symbol, description: String(b.description || '').slice(0, 600), image: pic.url, showName: true, twitter: link(b.twitter), telegram: link(b.telegram), website: link(b.website) }
    if (json.website) json.createdOn = json.website
    const meta = await put(`m/${id}.json`, JSON.stringify(json), { access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 31536000 })
    return res.status(200).json({ uri: meta.url, image: pic.url, id })
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }) }
}
