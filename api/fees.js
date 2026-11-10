// What every coin launched with dzz has generated in fees for its dev, and how much the dev has claimed. All read from Solana.
//   GET /api/fees → { coins: [{ mint, name, symbol, image, venue, dev, generated, claimed, waiting, note }], reading, at }   amounts in lamports
// Meteora keeps running totals on the coin's pool, so those are exact and need no history. pump.fun keeps one fee vault per dev
// wallet, not per coin: its figures are the wallet's, read from every claim out of its vaults, a batch at a time, remembered
// in dzz's store. pump.fun now keeps new creator fees inside each coin's bonding curve and sweeps them into the vault in the same
// transaction as the claim, so a claim is read from pump.fun's own CollectCreatorFee event (the vault's net change misses the sweep),
// and fees not swept yet count as waiting.
import { put, getJson } from './_store.js'
import { waitUntil } from '@vercel/functions'
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
// publicnode only keeps recent history, so anything that reads the past has to ask a full node first or it undercounts
const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean), HISTORY = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-mainnet.gateway.tatum.io'].filter(Boolean), PER_RUN = +process.env.FEES_PER_RUN || 120
const sleep = (ms) => new Promise((f) => setTimeout(f, ms))
const BUDGET = +process.env.FEES_BUDGET || 28000; let stopAt = Date.now() + BUDGET   // stop reading in time to save progress and answer

// a null answer counts as a miss: public RPCs drop old transactions, so the next one may still have it
async function rpc(method, params) {
  for (let round = 0; round < 3 && Date.now() < stopAt; round++) {
    for (const url of /^get(Signatures|Transaction)/.test(method) ? HISTORY : RPCS) {
      try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(5000) })).json(); if (!r.error && r.result != null) return r.result } catch {}
    }
    await sleep(500 * (round + 1))
  }
  return null
}
const load = (name) => getJson(name)
const save = async (name, v) => { try { await put(name, JSON.stringify(v)) } catch {} }
const u64 = (d, o) => Number(d.readBigUInt64LE(o))
// pump.fun's CollectCreatorFeeEvent: 8-byte tag, timestamp, creator, creator_fee (lamports actually paid to the creator)
const CLAIM_EVT = '7a027f010ebf0caf'
function claimEvents(tx, dev) {
  let n = 0, seen = false
  for (const l of tx.meta.logMessages || []) {
    if (!l.startsWith('Program data: ')) continue
    const b = Buffer.from(l.slice(14), 'base64')
    if (b.length >= 56 && b.subarray(0, 8).toString('hex') === CLAIM_EVT && enc58(b.subarray(16, 48)) === dev) { n += u64(b, 48); seen = true }
  }
  return seen ? n : null
}

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
  // a coin paired with another token earns its fees in that token: shown in SOL at today's price, with the raw amounts kept
  const others = [...new Set([...quote.values()].filter((q) => q && q !== WSOL))], rate = {}
  if (others.length) {
    try {
      const mints = (await rpc('getMultipleAccounts', [others, { encoding: 'base64' }]))?.value || []
      const px = await (await fetch('https://lite-api.jup.ag/price/v3?ids=' + [WSOL, ...others].join(','), { signal: AbortSignal.timeout(5000) })).json()
      others.forEach((q, i) => { const d = mints[i] && Buffer.from(mints[i].data[0], 'base64')[44], usd = px[q]?.usdPrice, solUsd = px[WSOL]?.usdPrice; if (d != null && usd && solUsd) rate[q] = { decimals: d, perUnit: (usd / solUsd) * 1e9 / 10 ** d } })
    } catch {}
  }
  return rows.map((r) => {
    if (r.missing) return { ...base(r.c), note: 'could not read this pool' }
    const q = quote.get(r.config), sol = q === WSOL, grad = r.graduated ? 'graduated: fees from the locked pool aren’t counted' : ''
    if (sol) return { ...base(r.c), dev: r.dev, generated: r.generated, claimed: r.claimed, waiting: r.waiting, note: grad }
    const k = rate[q], conv = (n) => (k ? Math.round(n * k.perUnit) : null)
    return { ...base(r.c), dev: r.dev, quote: q, raw: { generated: r.generated, claimed: r.claimed, waiting: r.waiting, decimals: k?.decimals ?? null }, generated: conv(r.generated), claimed: conv(r.claimed), waiting: conv(r.waiting), converted: !!k, note: k ? ['fees are in its paired token, shown in SOL at today’s price', grad].filter(Boolean).join('; ') : 'fees are in its paired token, not SOL' }
  })
}
const base = (c) => ({ mint: c.mint, name: c.name, symbol: c.symbol, image: c.image, venue: c.venue || 'pump', at: c.at })

// every movement through a fee vault, kept by signature: money in is fees, money out is a claim, whoever made it. A stale read can
// only repeat work, because a signature is never counted twice
async function flows(address, isToken, dev) {
  const file = `fees/c-${address}.json`, s = (await load(file)) || { moves: {} }; let before, todo = [], full = true
  for (let page = 0; page < 10; page++) {
    const sigs = await rpc('getSignaturesForAddress', [address, { limit: 1000, ...(before ? { before } : {}) }])
    if (!sigs) { full = false; break }
    todo.push(...sigs.filter((x) => !x.err && !(x.signature in s.moves))); if (sigs.length < 1000) break; before = sigs.at(-1).signature
  }
  let left = PER_RUN, changed = false, did = 0
  for (const x of todo) {
    if (!left-- || Date.now() > stopAt) break
    const tx = await rpc('getTransaction', [x.signature, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]); if (!tx) { full = false; continue }
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable || []), ...(tx.meta.loadedAddresses?.readonly || [])], i = keys.indexOf(address)
    const held = (list) => Number((list || []).find((t) => t.accountIndex === i)?.uiTokenAmount.amount || 0)
    const paid = isToken ? null : claimEvents(tx, dev)
    s.moves[x.signature] = paid != null ? -paid : i < 0 ? 0 : isToken ? held(tx.meta.postTokenBalances) - held(tx.meta.preTokenBalances) : tx.meta.postBalances[i] - tx.meta.preBalances[i]; changed = true; did++
  }
  if (changed) await save(file, s)
  const v = Object.values(s.moves)
  return { out: v.filter((n) => n < 0).reduce((a, n) => a - n, 0), read: v.length, done: full && did === todo.length }
}

// fees still inside the dev's bonding curves: what a curve holds beyond its rent and its real SOL reserves
async function unswept(mints) {
  const keys = mints.map((m) => enc58(pda([Buffer.from('bonding-curve'), dec58(m)], PUMP)))
  const accs = (await rpc('getMultipleAccounts', [keys, { encoding: 'base64' }]))?.value || [], rents = {}
  let n = 0
  for (const a of accs) {
    if (!a) continue
    const d = Buffer.from(a.data[0], 'base64'); if (d.length < 49) continue
    rents[d.length] ??= (await rpc('getMinimumBalanceForRentExemption', [d.length])) || a.lamports
    n += Math.max(0, a.lamports - rents[d.length] - u64(d, 32))
  }
  return n
}

async function vaults(dev, mints) {
  const key = dec58(dev), curve = enc58(pda([Buffer.from('creator-vault'), key], PUMP))
  const auth = pda([Buffer.from('creator_vault'), key], AMM), pool = enc58(pda([auth, dec58(TOKEN), dec58(WSOL)], ATA))
  const [bal, tok, rent, inCurves] = await Promise.all([rpc('getBalance', [curve]), rpc('getTokenAccountBalance', [pool]), rpc('getMinimumBalanceForRentExemption', [0]), unswept(mints)])
  const [a, b] = await Promise.all([flows(curve, false, dev), tok ? flows(pool, true, dev) : { out: 0, done: true }])
  const waiting = Math.max(0, (bal?.value || 0) - (rent || 0)) + Number(tok?.value?.amount || 0) + inCurves, claimed = a.out + b.out
  return { generated: claimed + waiting, claimed, waiting, done: a.done && b.done }
}

async function pumpRows(coins) {
  const rows = []; let reading = false
  const devs = (await load('fees/devs.json')) || {}, seen = {}; let changed = false
  for (const c of coins) {
    if (!devs[c.mint] && c.dev) { devs[c.mint] = c.dev; changed = true }
    if (!devs[c.mint]) { const tx = await rpc('getTransaction', [c.sig, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]); if (tx) { devs[c.mint] = tx.transaction.message.accountKeys[0]; changed = true } }
    const dev = devs[c.mint]; if (!dev) { rows.push({ ...base(c), note: 'could not read the launch' }); reading = true; continue }
    const v = (seen[dev] ??= await vaults(dev, coins.filter((x) => (devs[x.mint] || x.dev) === dev).map((x) => x.mint))); if (!v.done) reading = true
    rows.push({ ...base(c), dev, generated: v.generated, claimed: v.claimed, waiting: v.waiting, reading: !v.done, note: 'pump.fun keeps fees per wallet, so this covers everything this dev wallet launched' })
  }
  if (changed) await save('fees/devs.json', devs)
  return { rows, reading }
}

// One read of everything, saved as a snapshot. Requests answer from the snapshot at once (reading the chain on public RPC takes
// 30 s or more), and a stale snapshot is refreshed in the background after the answer has gone out.
const SNAP = 'fees/snapshot.json'
async function readAll(budget) {
  stopAt = Date.now() + budget
  const coins = (await load('launched.json'))?.coins || (await (await fetch('https://dzzdeploy.vercel.app/api/launched')).json()).coins || []
  const met = coins.filter((c) => c.venue === 'meteora' && c.pool), pump = coins.filter((c) => c.venue !== 'meteora')
  const [m, p] = await Promise.all([met.length ? meteoraRows(met) : [], pump.length ? pumpRows(pump) : { rows: [], reading: false }])
  const snap = { coins: [...m, ...p.rows].sort((a, b) => b.at - a.at), reading: p.reading, at: Date.now() }
  await save(SNAP, snap); return snap
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*')
  try {
    const snap = await load(SNAP), age = snap ? Date.now() - snap.at : Infinity
    if (!snap) { const s = await readAll(BUDGET); res.setHeader('cache-control', 'public, s-maxage=10'); return res.status(200).json(s) }
    // stale: one refresh at a time (busy marks one in flight), up to ~50 s after the answer
    if (age > (snap.reading ? 15000 : 90000) && !(snap.busy && Date.now() - snap.busy < 65000)) {
      await save(SNAP, { ...snap, busy: Date.now() })
      waitUntil(readAll(48000).catch(() => save(SNAP, { ...snap, busy: 0 })))
    }
    res.setHeader('cache-control', 'public, s-maxage=10, stale-while-revalidate=60')
    const { busy, ...out } = snap
    return res.status(200).json(out)
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }) }
}
