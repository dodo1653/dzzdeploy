// Helius gateway for the browser: Solana RPC (allow-listed methods), the Privacy Rings indexer and the prover.
// The API key stays here (env HELIUS_KEY). The prover traffic is end-to-end encrypted to Helius's enclave by the SDK.
export const config = { api: { bodyParser: false } }
const HOST = 'https://mainnet.helius-rpc.com'
const RPC_OK = new Set(['getLatestBlockhash', 'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getTokenAccountsByOwner', 'getTokenAccountBalance', 'sendTransaction', 'getSignatureStatuses', 'getTransaction', 'getSlot', 'getBlockHeight', 'getEpochInfo', 'getMinimumBalanceForRentExemption', 'simulateTransaction', 'getProgramAccounts', 'getFeeForMessage', 'getRecentPrioritizationFees', 'getGenesisHash', 'getVersion', 'getHealth', 'getSignaturesForAddress', 'getTokenSupply', 'getAsset', 'getTransactionsForAddress'])
const raw = (req) => new Promise((ok, no) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no) })
export default async function handler(req, res) {
  const key = process.env.HELIUS_KEY
  if (!key) return res.status(503).json({ error: 'privacy gateway not configured' })
  const parts = [].concat(req.query.p || []), kind = parts[0], rest = parts.slice(1).map(encodeURIComponent).join('/')
  const qs = new URL(req.url, 'http://x').searchParams; qs.delete('p'); qs.set('api-key', key)
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await raw(req)
  let target
  if (kind === 'rpc') {
    if (req.method !== 'POST') return res.status(405).end()
    let j; try { j = JSON.parse(body.toString()) } catch { return res.status(400).json({ error: 'bad json' }) }
    const calls = Array.isArray(j) ? j : [j]
    if (calls.length > 20 || calls.some((c) => !RPC_OK.has(c.method))) return res.status(403).json({ error: 'method not allowed' })
    target = `${HOST}/?api-key=${key}`
  } else if (kind === 'spr') target = `${HOST}/v1/spr${rest ? '/' + rest : ''}?${qs}`
  else return res.status(404).end()
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) if (/^(content-type|accept|x-[a-z0-9-]+)$/i.test(k) && !/^x-(vercel|forwarded|real-ip)/i.test(k)) headers[k] = v
  try {
    const r = await fetch(target, { method: req.method, headers, body, signal: AbortSignal.timeout(55000) })
    res.status(r.status)
    for (const [k, v] of r.headers) if (/^(content-type|x-[a-z0-9-]+)$/i.test(k)) res.setHeader(k, v)
    res.setHeader('cache-control', 'no-store')
    return res.end(Buffer.from(await r.arrayBuffer()))
  } catch (e) { return res.status(502).json({ error: 'gateway: ' + String(e.message || e).slice(0, 120) }) }
}
