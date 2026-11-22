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
const rpc = async (method, params) => {
  const j = await (await fetch(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(25000) })).json()
  if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  try {
    const { kp, me } = await relayer()
    if (req.method !== 'POST') return res.status(200).json({ relayer: me })
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
