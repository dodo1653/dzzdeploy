// Helius gateway for the browser (private launches): Solana RPC (allow-listed methods), the Privacy Rings indexer and the prover.
// Reached through the rewrite /api/h/<path> -> /api/h?p=<path>. The key stays here (env HELIUS_KEY); prover traffic is
// end-to-end encrypted by the SDK to Helius's enclave.
export const config = { api: { bodyParser: false } }
const HOST = 'https://mainnet.helius-rpc.com'
const RPC_OK = new Set(['getLatestBlockhash', 'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getTokenAccountsByOwner', 'getTokenAccountBalance', 'sendTransaction', 'getSignatureStatuses', 'getTransaction', 'getSlot', 'getBlockHeight', 'getEpochInfo', 'getMinimumBalanceForRentExemption', 'simulateTransaction', 'getProgramAccounts', 'getFeeForMessage', 'getRecentPrioritizationFees', 'getGenesisHash', 'getVersion', 'getHealth', 'getSignaturesForAddress', 'getTokenSupply', 'getAsset'])
const raw = (req) => new Promise((ok, no) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no) })
export default async function handler(req, res) {
  const key = process.env.HELIUS_KEY
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
  try {
    const r = await fetch(target, { method: req.method, headers, body, signal: AbortSignal.timeout(55000) })
    res.status(r.status)
    for (const [k, v] of r.headers) if (/^(content-type|x-[a-z0-9-]+)$/i.test(k)) res.setHeader(k, v)
    res.setHeader('cache-control', 'no-store')
    return res.end(Buffer.from(await r.arrayBuffer()))
  } catch (e) { return res.status(502).json({ error: 'gateway: ' + String(e.message || e).slice(0, 120) }) }
}
