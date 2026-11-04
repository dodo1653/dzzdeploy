// Position NFTs of a wallet, for claiming fees on a graduated Meteora coin: public RPCs in the browser refuse this lookup.
//   GET /api/nfts?owner=<wallet> → { mints: [...] }
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean)
async function rpc(method, params) {
  let last
  for (const url of RPCS) {
    try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json(); if (r.error) throw new Error(r.error.message); return r.result } catch (e) { last = e }
  }
  throw last
}
export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('cache-control', 'no-store')
  const owner = String(req.query.owner || '')
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) return res.status(400).json({ error: 'bad owner' })
  try {
    const r = await rpc('getTokenAccountsByOwner', [owner, { programId: T22 }, { encoding: 'jsonParsed' }])
    const mints = (r?.value || []).map((x) => x.account.data.parsed.info).filter((i) => i.tokenAmount.amount === '1' && i.tokenAmount.decimals === 0).map((i) => i.mint)
    return res.status(200).json({ mints })
  } catch (e) { return res.status(502).json({ error: String(e.message || e).slice(0, 160) }) }
}
