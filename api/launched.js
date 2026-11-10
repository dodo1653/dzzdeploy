// The public list of coins launched with dzz.
//   GET  /api/launched                 → { coins: [{ mint, name, symbol, image, uri, sig, at, dev, venue?, pool? }] } newest first (cached ~15 s)
//   POST /api/launched { mint, signature }
// A POST is only listed after it checks out on Solana: the transaction succeeded, it ran pump.fun's or Meteora's create for
// exactly that mint, and the coin's metadata lives where dzz puts it (this project's Blob store, or the desktop app's
// jsDelivr-served dzzdeploy repo, or the old Blob store). `dev` is the wallet that signed and paid for the launch (profiles
// group coins by it). The list is one JSON file in dzz's store (launched.json).
import { put, getJson, STORE } from './_store.js'

const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const DBC = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'                  // Meteora's bonding curve program
const DBC_CREATE = [[140, 85, 215, 176, 102, 54, 104, 79], [169, 118, 51, 78, 145, 110, 220, 155]].map((d) => Buffer.from(d))   // initialize_virtual_pool_with_spl_token / _token2022: accounts 3 = mint, 5 = pool
const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean)
const OURS = new RegExp('^(https://([a-z0-9]+\.public\.blob\.vercel-storage\.com|cdn\.jsdelivr\.net/gh/dodo1653/dzzdeploy@)|' + STORE.replace(/[.*+?^${}()|[\]\/]/g, '\$&') + '/s/m/)', 'i')
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const b58dec = (s) => { let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i) } let h = n.toString(16); if (h.length % 2) h = '0' + h; const out = Buffer.from(h === '0' ? '' : h, 'hex'); let z = 0; for (const c of s) { if (c !== '1') break; z++ } return Buffer.concat([Buffer.alloc(z), out]) }

async function rpc(method, params) {
  let last
  for (const url of RPCS) {
    try {
      const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()
      if (r.error) throw new Error(r.error.message); return r.result
    } catch (e) { last = e }
  }
  throw last
}
// pump.fun's and Meteora's create arguments both start with three borsh strings: name, symbol, uri
function createArgs(data) {
  let o = 8; const str = () => { const n = data.readUInt32LE(o); o += 4; if (n > 400) throw new Error('not a create'); const s = data.subarray(o, o + n).toString('utf8'); o += n; return s }
  return { name: str(), symbol: str(), uri: str() }
}
async function readList() {
  return (await getJson('launched.json'))?.coins || []
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  try {
    if (req.method === 'GET') { res.setHeader('cache-control', 'public, s-maxage=15, stale-while-revalidate=60'); return res.status(200).json({ coins: await readList() }) }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const mint = String(b.mint || ''), sig = String(b.signature || '')
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) return res.status(400).json({ error: 'bad mint or signature' })
    let list = await readList()
    if (list.some((c) => c.mint === mint)) return res.status(200).json({ ok: true, already: true })
    // the transaction, as Solana has it
    let tx = null
    for (let i = 0; i < 6 && !tx; i++) { tx = await rpc('getTransaction', [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]); if (!tx) await new Promise((r) => setTimeout(r, 2500)) }
    if (!tx) return res.status(404).json({ error: 'transaction not found yet, try again in a minute' })
    if (tx.meta?.err) return res.status(400).json({ error: 'that transaction failed on chain' })
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable || []), ...(tx.meta?.loadedAddresses?.readonly || [])]
    if (!keys.includes(mint)) return res.status(400).json({ error: 'that transaction does not touch this mint' })
    let meta = null, extra = {}
    for (const ix of tx.transaction.message.instructions) {
      const prog = keys[ix.programIdIndex]
      try {
        if (prog === PUMP) { const a = createArgs(b58dec(ix.data)); if (keys[ix.accounts[0]] === mint) { meta = a; break } }
        if (prog === DBC) { const d = b58dec(ix.data); if (DBC_CREATE.some((x) => d.subarray(0, 8).equals(x)) && keys[ix.accounts[3]] === mint) { meta = createArgs(d); extra = { venue: 'meteora', pool: keys[ix.accounts[5]] }; break } }
      } catch {}
    }
    if (!meta) return res.status(400).json({ error: 'no pump.fun or Meteora create for this mint in that transaction' })
    if (!OURS.test(meta.uri)) return res.status(400).json({ error: 'not launched with dzz' })
    let image = ''; try { image = (await (await fetch(meta.uri)).json()).image || '' } catch {}
    const coin = { mint, name: meta.name.slice(0, 32), symbol: meta.symbol.slice(0, 10), image, uri: meta.uri, sig, at: (tx.blockTime || Math.floor(Date.now() / 1000)) * 1000, dev: keys[0], ...extra }
    list = [coin, ...(await readList()).filter((c) => c.mint !== mint)].slice(0, 500)
    await put('launched.json', JSON.stringify({ coins: list }))
    return res.status(200).json({ ok: true, coin })
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }) }
}
