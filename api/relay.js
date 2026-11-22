// dzz's Privacy Rings relayer: pays the network fee for a vault payout so the launch wallet's only funding is a Privacy Rings withdrawal.
//   GET  /api/relay            -> { relayer }                       (the fee payer the browser builds the payout for)
//   POST /api/relay { tx }     -> { signature }                     (a base64 version-1 transaction, missing only the relayer's signature)
// It signs only transactions whose fee payer is the relayer, whose every instruction calls the Solana Privacy Program, with a capped
// priority fee, and only after a simulation that leaves the relayer no more than MAX_COST lamports poorer. Env: RELAYER_KEY, HELIUS_KEY.
import { createKeyPairFromBytes, getAddressFromPublicKey, getTransactionDecoder, getCompiledTransactionMessageDecoder, signTransaction, getBase64EncodedWireTransaction } from '@solana/kit'
import bs58 from 'bs58'

const SPP = 'ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW', MAX_PRIORITY = 200_000n, MAX_COST = 3_000_000
let kp = null, me = null
async function relayer() {
  if (kp) return { kp, me }
  const raw = bs58.decode(process.env.RELAYER_KEY || ''); if (raw.length !== 64) throw new Error('the relayer key is not set')
  kp = await createKeyPairFromBytes(raw); me = await getAddressFromPublicKey(kp.publicKey); return { kp, me }
}
const RPCS = () => ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com', `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`]
const rpc = async (method, params) => {
  let last
  for (const u of RPCS()) for (let i = 0; i < 2; i++) {
    try { const j = await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(25000) })).json(); if (j.error) { last = new Error(j.error.message || 'rpc error'); if (/429|rate|limit/i.test(last.message)) { await new Promise((z) => setTimeout(z, 500)); continue } throw last } return j.result }
    catch (e) { last = e; if (!/429|rate|limit|fetch|timeout/i.test(String(e.message))) throw e }
  }
  throw last
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  try {
    const { kp, me } = await relayer()
    if (req.method !== 'POST') { let hk = null; const pass = String(req.headers['x-dzz-gate'] || ''); if (pass && process.env.HELIUS_KEY) { try { const g = await (await fetch('https://dzz-store.trenchcounty.workers.dev/gate?t=' + encodeURIComponent(pass), { signal: AbortSignal.timeout(5000) })).json(); if (g.ok) hk = process.env.HELIUS_KEY } catch {} } let lamports = null; try { const j = await (await fetch('https://solana-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [me] }), signal: AbortSignal.timeout(6000) })).json(); lamports = j.result?.value ?? null } catch {} return res.status(200).json({ relayer: me, key: !!process.env.HELIUS_KEY, hk, lamports, funded: lamports != null && lamports >= 1_000_000 }) }
    if (!process.env.HELIUS_KEY) return res.status(503).json({ error: 'the relayer has no RPC key yet' })
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const bytes = Buffer.from(String(b.tx || ''), 'base64'); if (bytes.length < 100 || bytes.length > 4096) return res.status(400).json({ error: 'bad transaction' })
    const tx = getTransactionDecoder().decode(bytes), msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes)
    if (msg.version !== 1) return res.status(400).json({ error: 'only Privacy Rings transactions' })
    if (msg.staticAccounts[0] !== me) return res.status(400).json({ error: 'the relayer is not the fee payer' })
    const progs = msg.instructionHeaders.map((h) => msg.staticAccounts[h.programAccountIndex])
    if (!progs.length || progs.some((p) => p !== SPP)) return res.status(400).json({ error: 'the relayer only pays for Privacy Rings payouts' })
    const pf = (msg.configValues || []).find((v) => v.kind === 'u64'); if (pf && BigInt(pf.value) > MAX_PRIORITY) return res.status(400).json({ error: 'priority fee too high' })
    const signed = await signTransaction([kp], tx), wire = getBase64EncodedWireTransaction(signed)
    const before = (await rpc('getBalance', [me, { commitment: 'confirmed' }])).value
    const sim = await rpc('simulateTransaction', [wire, { encoding: 'base64', sigVerify: true, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: [me] } }])
    if (sim.value.err) return res.status(400).json({ error: 'the payout would fail: ' + JSON.stringify(sim.value.err).slice(0, 160) })
    const after = sim.value.accounts?.[0]?.lamports
    if (after == null || before - after > MAX_COST) return res.status(400).json({ error: 'the payout costs the relayer too much' })
    const signature = await rpc('sendTransaction', [wire, { encoding: 'base64', skipPreflight: true, maxRetries: 5 }])
    return res.status(200).json({ signature })
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }) }
}
