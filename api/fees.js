// What every coin launched with dzz has generated in fees for its dev, and how much the dev has claimed. All read from Solana.
//   GET /api/fees → { coins: [{ mint, name, symbol, image, venue, dev, generated, claimed, waiting, note }], reading, at }   amounts in lamports
// Meteora keeps running totals on the coin's pool, so those are exact and need no history. pump.fun keeps one fee vault per dev
// wallet, not per coin: its figures are the wallet's, read from every movement through its vaults, a batch at a time, remembered
// in Blob.
import { put, head } from '@vercel/blob'
import { ed25519 } from '@noble/curves/ed25519'
import crypto from 'node:crypto'

const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', AMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', WSOL = 'So11111111111111111111111111111111111111112'
// addresses by hand: @solana/web3.js crashes this function on start
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const enc58 = (b) => { let n = 0n; for (const x of b) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n } for (const x of b) { if (x) break; s = '1' + s } return s }
const dec58 = (s) => { let n = 0n; for (const c of s) n = n * 58n + BigInt(A58.indexOf(c)); const o = Buffer.alloc(32); for (let i = 31; i >= 0; i--) { o[i] = Number(n & 255n); n >>= 8n } return o }
const onCurve = (b) => { try { ed25519.ExtendedPoint.fromHex(b); return true } catch { return false } }
export function pda(seeds, program) {
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash('sha256'); for (const s of seeds) h.update(s); h.update(Buffer.from([bump])).update(dec58(program)).update('ProgramDerivedAddress')
    const d = h.digest(); if (!onCurve(d)) return d
  }
  throw new Error('no address')
}
const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean), PER_RUN = +process.env.FEES_PER_RUN || 40
const token = () => process.env.BLOB_READ_WRITE_TOKEN || Object.entries(process.env).find(([k, v]) => /READ_WRITE_TOKEN$/.test(k) && /^vercel_blob_rw_/.test(String(v)))?.[1]
const opts = () => (token() ? { token: token() } : {})
const sleep = (ms) => new Promise((f) => setTimeout(f, ms))

// a null answer counts as a miss: public RPCs drop old transactions, so the next one may still have it
async function rpc(method, params) {
  for (let round = 0; round < 3; round++) {
    for (const url of RPCS) {
      try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json(); if (!r.error && r.result != null) return r.result } catch {}
    }
    await sleep(500 * (round + 1))
  }
  return null
}
const load = async (name) => { try { const h = await head(name, opts()); const r = await fetch(`${h.url}?t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) return await r.json() } catch {} return null }
const save = async (name, v) => { try { await put(name, JSON.stringify(v), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, ...opts() }) } catch {} }
const u64 = (d, o) => Number(d.readBigUInt64LE(o))

// a Meteora curve pool: total_trading_quote_fee is everything the dev side ever earned, the two fee fields are what's still unclaimed
export function poolFees(d) {
  const generated = u64(d, 336), waiting = u64(d, 272) + u64(d, 360)
  return { generated, waiting, claimed: generated - waiting, dev: enc58(d.subarray(104, 136)), config: enc58(d.subarray(72, 104)), graduated: d[305] === 1 }
}

async function meteoraRows(coins) {
  const accs = (await rpc('getMultipleAccounts', [coins.map((c) => c.pool), { encoding: 'base64' }]))?.value || []
  const rows = coins.map((c, i) => (accs[i] ? { c, ...poolFees(Buffer.from(accs[i].data[0], 'base64')) } : { c, missing: true }))
  const cfgKeys = [...new Set(rows.filter((r) => r.config).map((r) => r.config))]
  const cfgs = (await rpc('getMultipleAccounts', [cfgKeys, { encoding: 'base64' }]))?.value || [], quote = new Map(cfgKeys.map((k, i) => [k, cfgs[i] ? enc58(Buffer.from(cfgs[i].data[0], 'base64').subarray(8, 40)) : null]))
  return rows.map((r) => {
    if (r.missing) return { ...base(r.c), note: 'could not read this pool' }
    const sol = quote.get(r.config) === WSOL
    return { ...base(r.c), dev: r.dev, generated: sol ? r.generated : null, claimed: sol ? r.claimed : null, waiting: sol ? r.waiting : null, note: !sol ? 'fees are in its paired token, not SOL' : r.graduated ? 'graduated: fees from the locked pool aren’t counted' : '' }
  })
}
const base = (c) => ({ mint: c.mint, name: c.name, symbol: c.symbol, image: c.image, venue: c.venue || 'pump', at: c.at })

// every movement through a fee vault, kept by signature: money in is fees, money out is a claim, whoever made it. A stale read can
// only repeat work, because a signature is never counted twice
async function flows(address, isToken) {
  const file = `fees/v-${address}.json`, s = (await load(file)) || { moves: {} }; let before, todo = [], full = true
  for (let page = 0; page < 10; page++) {
    const sigs = await rpc('getSignaturesForAddress', [address, { limit: 1000, ...(before ? { before } : {}) }])
    if (!sigs) { full = false; break }
    todo.push(...sigs.filter((x) => !x.err && !(x.signature in s.moves))); if (sigs.length < 1000) break; before = sigs.at(-1).signature
  }
  let left = PER_RUN, changed = false
  for (const x of todo) {
    if (!left--) break
    const tx = await rpc('getTransaction', [x.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); if (!tx) { full = false; continue }
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable || []), ...(tx.meta.loadedAddresses?.readonly || [])], i = keys.indexOf(address)
    const held = (list) => Number((list || []).find((t) => t.accountIndex === i)?.uiTokenAmount.amount || 0)
    s.moves[x.signature] = i < 0 ? 0 : isToken ? held(tx.meta.postTokenBalances) - held(tx.meta.preTokenBalances) : tx.meta.postBalances[i] - tx.meta.preBalances[i]; changed = true
  }
  if (changed) await save(file, s)
  const v = Object.values(s.moves)
  return { out: v.filter((n) => n < 0).reduce((a, n) => a - n, 0), read: v.length, done: full && todo.length <= PER_RUN }
}

async function vaults(dev) {
  const key = dec58(dev), curve = enc58(pda([Buffer.from('creator-vault'), key], PUMP))
  const auth = pda([Buffer.from('creator_vault'), key], AMM), pool = enc58(pda([auth, dec58(TOKEN), dec58(WSOL)], ATA))
  const [bal, tok, rent] = await Promise.all([rpc('getBalance', [curve]), rpc('getTokenAccountBalance', [pool]), rpc('getMinimumBalanceForRentExemption', [0])])
  const [a, b] = await Promise.all([flows(curve, false), tok ? flows(pool, true) : { out: 0, done: true }])
  const waiting = Math.max(0, (bal?.value || 0) - (rent || 0)) + Number(tok?.value?.amount || 0), claimed = a.out + b.out
  return { generated: claimed + waiting, claimed, waiting, done: a.done && b.done }
}

async function pumpRows(coins) {
  const rows = []; let reading = false
  const devs = (await load('fees/devs.json')) || {}; let changed = false
  for (const c of coins) {
    if (!devs[c.mint]) { const tx = await rpc('getTransaction', [c.sig, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); if (tx) { devs[c.mint] = tx.transaction.message.accountKeys[0]; changed = true } }
    const dev = devs[c.mint]; if (!dev) { rows.push({ ...base(c), note: 'could not read the launch' }); reading = true; continue }
    const v = await vaults(dev); if (!v.done) reading = true
    rows.push({ ...base(c), dev, generated: v.generated, claimed: v.claimed, waiting: v.waiting, reading: !v.done, note: 'pump.fun keeps fees per wallet, so this covers everything this dev wallet launched' })
  }
  if (changed) await save('fees/devs.json', devs)
  return { rows, reading }
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*')
  try {
    const coins = (await load('launched.json'))?.coins || (await (await fetch('https://dzzdeploy.vercel.app/api/launched')).json()).coins || []
    const met = coins.filter((c) => c.venue === 'meteora' && c.pool), pump = coins.filter((c) => c.venue !== 'meteora')
    const [m, p] = await Promise.all([met.length ? meteoraRows(met) : [], pump.length ? pumpRows(pump) : { rows: [], reading: false }])
    res.setHeader('cache-control', p.reading ? 'public, s-maxage=20' : 'public, s-maxage=120, stale-while-revalidate=600')
    return res.status(200).json({ coins: [...m, ...p.rows].sort((a, b) => b.at - a.at), reading: p.reading, at: Date.now() })
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }) }
}
