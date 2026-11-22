// Helius gateway for the browser (private launches): Solana RPC (allow-listed methods), the Privacy Rings indexer and the prover.
// Reached through the rewrite /api/h/<path> -> /api/h?p=<path>. The key stays here (env HELIUS_KEY); prover traffic is
// end-to-end encrypted by the SDK to Helius's enclave.
export const config = { api: { bodyParser: false } }
const HOST = 'https://mainnet.helius-rpc.com'
const PUBLIC = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RPC_OK = new Set(['getLatestBlockhash', 'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getTokenAccountsByOwner', 'getTokenAccountBalance', 'sendTransaction', 'getSignatureStatuses', 'getTransaction', 'getSlot', 'getBlockHeight', 'getEpochInfo', 'getMinimumBalanceForRentExemption', 'simulateTransaction', 'getProgramAccounts', 'getFeeForMessage', 'getRecentPrioritizationFees', 'getGenesisHash', 'getVersion', 'getHealth', 'getSignaturesForAddress', 'getTokenSupply', 'getAsset'])
const raw = (req) => new Promise((ok, no) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no) })
export default async function handler(req, res) {
  const keys = [process.env.HELIUS_KEY, process.env.HELIUS_KEY2].filter(Boolean), key = keys[Math.floor(Math.random() * keys.length)]
  if (!key) return res.status(503).json({ error: 'NO_HELIUS_KEY' })
  const u = new URL(req.url, 'http://x'), parts = String(u.searchParams.get('p') || '').split('/').filter(Boolean)
  u.searchParams.delete('p'); u.searchParams.set('api-key', key)
  const kind = parts[0], rest = parts.slice(1).map(encodeURIComponent).join('/')
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await raw(req)
  let target
  if (kind === 'rpc') {
    if (req.method !== 'POST') return res.status(405).end()
    let j; try { j = JSON.parse(body.toString()) } catch { return res.status(400).json({ error: 'bad json' }) }
    const calls = Array.isArray(j) ? j : [j]
    if (calls.length > 20 || calls.some((c) => !RPC_OK.has(c.method))) return res.status(403).json({ error: 'method not allowed' })
    target = `${HOST}/?api-key=${key}`
  } else if (kind === 'spr') target = `${HOST}/v1/spr${rest ? '/' + rest : ''}?${u.searchParams}`
  else return res.status(404).end()
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) if (/^(content-type|accept|x-[a-z0-9-]+)$/i.test(k) && !/^x-(vercel|forwarded|real-ip|middleware)/i.test(k)) headers[k] = v
  // plain Solana calls go to public RPCs first (Helius credits are kept for Privacy Rings); every upstream gets 3 tries on 429 / 5xx
  const other = keys.find((k) => k !== key), alt = other ? target.split(key).join(other) : null
  const targets = kind === 'rpc' ? [...PUBLIC, target] : [target, alt].filter(Boolean)
  let last = null
  for (const t of targets) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(t, { method: req.method, headers, body, signal: AbortSignal.timeout(50000) })
        if (r.status === 429 || r.status >= 500) { last = r.status; await sleep(600 * (i + 1)); continue }
        const buf = Buffer.from(await r.arrayBuffer())
        if (kind === 'rpc' && t !== target && /"error"/.test(buf.slice(0, 300).toString()) && /429|rate|limit/i.test(buf.slice(0, 300).toString())) { last = 429; break }
        res.status(r.status)
        for (const [k, v] of r.headers) if (/^(content-type|x-[a-z0-9-]+)$/i.test(k)) res.setHeader(k, v)
        res.setHeader('cache-control', 'no-store')
        return res.end(buf)
      } catch (e) { last = String(e.message || e); await sleep(400) }
    }
  }
  return res.status(last === 429 ? 429 : 502).json({ error: last === 429 ? 'RATE_LIMITED' : 'gateway: ' + String(last).slice(0, 120) })
}
