// The leaderboard: dzz profiles ranked by the creator fees they have collected, across every wallet on the profile.
//   GET /api/leaderboard?cal=<key> → { key, name, avatar, banner, ev: [[time ms, lamports or null, 0 launch | 1 claim]] }: one profile's
//     PnL calendar. Only amounts and times: never which coins or wallets.
//   GET /api/leaderboard → { users: [{ key, name, avatar, banner, claimed, waiting, generated, coins, claims, last, first, since, venues }],
//                            profiles, launchers, totals: { claimed, waiting }, solUsd, reading, at }   amounts in lamports, times in ms
// Which wallet belongs to which profile comes from dzz-store (POST /admin/board, needs STORE_KEY); the figures come from the fees
// snapshot that /api/fees keeps. Each profile shows who it is: its name, its X and Discord handles, and the wallets it launched
// from (public on chain anyway; the owner asked that nobody on the board is anonymous, 2026-11-15). Other wallets on a profile
// stay private. A profile can leave the board from its account page (dzz-store POST /p/board { show: false }).
// pump.fun keeps fees per wallet, not per coin, so a wallet's pump.fun figures count once (the same rule as assets/feestotal.js).
import { getJson, STORE } from './_store.js'

const WSOL = 'So11111111111111111111111111111111111111112'
// a profile still called by its first wallet ("AbCd…WxYz") or the default name shows as unnamed: the short form points at a wallet
const plain = (n) => (!n || n === 'dzz profile' || /^[1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}$/.test(n) ? '' : String(n).slice(0, 32))

async function owners(wallets) {
  const r = await fetch(STORE + '/admin/board', { method: 'POST', headers: { authorization: 'Bearer ' + (process.env.STORE_KEY || ''), 'content-type': 'application/json' }, body: JSON.stringify({ wallets }), signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error('store ' + r.status)
  return r.json()
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*')
  try {
    const snap = (await getJson('fees/snapshot.json')) || (await (await fetch('https://dzzdeploy.vercel.app/api/fees')).json())
    const rows = snap?.coins || []
    const devs = [...new Set(rows.map((r) => r.dev).filter(Boolean))]
    const [own, solUsd] = await Promise.all([
      owners(devs),
      fetch('https://lite-api.jup.ag/price/v3?ids=' + WSOL, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).then((j) => j[WSOL]?.usdPrice || 0).catch(() => 0),
    ])
    const by = {}, pumpSeen = new Set(), sigSeen = new Set()
    for (const r of rows) {
      const key = own.owners?.[r.dev]; if (!key) continue
      const p = own.profiles[key], u = (by[key] ||= { key, name: plain(p.name), x: p.x || '', discord: p.discord || '', wallets: [], avatar: p.avatar, banner: p.banner, since: p.since, claimed: 0, waiting: 0, coins: 0, claims: 0, last: 0, first: 0, venues: [], ev: [] })
      u.coins++; if (!u.wallets.includes(r.dev)) u.wallets.push(r.dev); const v = r.venue || 'pump'; if (!u.venues.includes(v)) u.venues.push(v)
      if (r.born || r.at) u.ev.push([r.born || r.at, r.spent != null ? -r.spent : null, 0])
      if (r.born || r.at) u.first = u.first ? Math.min(u.first, r.born || r.at) : r.born || r.at
      if (r.generated == null) continue
      if (v !== 'meteora') { if (pumpSeen.has(r.dev + v)) continue; pumpSeen.add(r.dev + v) }
      u.claimed += r.claimed || 0; u.waiting += r.waiting || 0
      for (const c of r.claims || []) { if (sigSeen.has(c.sig)) continue; sigSeen.add(c.sig); u.claims++; if (c.at > u.last) u.last = c.at; if (c.at) u.ev.push([c.at, c.n ?? null, 1]) }
    }
    const cal = String(req.query?.cal || '')
    if (cal) {
      const u = by[cal]; res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300')
      if (!u) return res.status(404).json({ error: 'that profile is not on the leaderboard' })
      return res.status(200).json({ key: u.key, name: u.name, x: u.x, discord: u.discord, wallets: u.wallets, avatar: u.avatar, banner: u.banner, ev: u.ev.sort((a, b) => a[0] - b[0]), solUsd })
    }
    const users = Object.values(by).map(({ ev, ...u }) => ({ ...u, generated: u.claimed + u.waiting })).sort((a, b) => b.claimed - a.claimed || b.generated - a.generated || a.first - b.first)
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({
      users, profiles: own.users || 0, launchers: devs.length,
      totals: { claimed: users.reduce((a, u) => a + u.claimed, 0), waiting: users.reduce((a, u) => a + u.waiting, 0) },
      solUsd, reading: !!(snap.reading || snap.histReading), at: snap.at || Date.now(),
    })
  } catch (e) { return res.status(503).json({ error: String(e.message || e).slice(0, 160), users: [] }) }
}
