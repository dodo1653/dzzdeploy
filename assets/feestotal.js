// "Your creator fees": one total across every wallet you launch from, for the website app and the desktop app.
// Wallets come from your dzz profile (sign in with a wallet, on this page or on /me) plus, in the desktop app, the dev wallets of
// the coins in its local history (window.DZZ_MY_MINTS). Figures come from dzzdeploy's /api/fees, read from Solana.
// Usage: <div id="feesTotal"></div> then load this script. pump.fun keeps fees per wallet, so each wallet's pump.fun total counts once.
;(() => {
  const SITE = 'https://dzzdeploy.vercel.app', STORE = 'https://dzz-store.trenchcounty.workers.dev', WSOL = 'So11111111111111111111111111111111111111112'
  const root = document.getElementById('feesTotal'); if (!root) return
  const local = location.origin !== SITE && !/dzzdeploy/.test(location.hostname)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const sol = (l) => (!l ? '0' : (l / 1e9).toFixed(l < 1e8 ? 4 : 3)), usd = (l, p) => (p ? '$' + ((l / 1e9) * p).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '')
  const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const enc58 = (b) => { let n = 0n; for (const x of b) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n } for (const x of b) { if (x) break; s = '1' + s } return s }
  const token = { get: () => { try { return localStorage.getItem('dzz.profile') } catch { return null } }, set: (t) => { try { t ? localStorage.setItem('dzz.profile', t) : localStorage.removeItem('dzz.profile') } catch {} } }
  async function api(path, body, t = token.get()) {
    const r = await (await fetch(STORE + '/p/' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })).json()
    if (r.error) throw new Error(r.error); return r
  }
  const provider = () => window.phantom?.solana || window.solflare || window.backpack?.solana || window.backpack || window.solana || null

  const css = document.createElement('style')
  css.textContent = `#feesTotal .ft { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line, rgba(255,255,255,.08)); border: 1px solid var(--line, rgba(255,255,255,.08)); border-radius: 10px; overflow: hidden; }
#feesTotal .ft div { background: var(--bg2, var(--bg, #0b0d14)); padding: 14px 16px; min-width: 0; } #feesTotal .ft b { display: block; font: 500 22px/1.2 var(--mono, ui-monospace, monospace); letter-spacing: -.02em; } #feesTotal .ft b small { font-size: 13px; color: var(--t3, #6c707b); margin-left: 4px; }
#feesTotal .ft span { display: block; font-size: 12.5px; color: var(--t3, #6c707b); margin-top: 3px; } #feesTotal .ft i { font-style: normal; color: var(--t2, #a7abb5); font: 400 12.5px var(--mono, ui-monospace, monospace); }
#feesTotal .fx { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; color: var(--t3, #6c707b); }
#feesTotal .fx a, #feesTotal .fx button { all: unset; cursor: pointer; color: var(--acc, #6ea8ff); } #feesTotal .fx a:hover, #feesTotal .fx button:hover { text-decoration: underline; }
@media (max-width: 640px) { #feesTotal .ft { grid-template-columns: 1fr; } }`
  document.head.appendChild(css)

  let busy = false, again = false
  async function signIn() {
    const p = provider(); if (!p) return foot('No Solana wallet found in this browser.')
    try {
      const r0 = await p.connect(), w = (r0?.publicKey || p.publicKey).toString(), { nonce } = await api('nonce', {}); foot('Sign the message in your wallet…')
      const s = await p.signMessage(new TextEncoder().encode(`dzz sign-in\nwallet: ${w}\nnonce: ${nonce}`), 'utf8')
      token.set((await api('signin', { wallet: w, nonce, signature: enc58(s.signature || s) }, null)).token); draw()
    } catch (e) { foot(String(e.message || e).slice(0, 140)) }
  }
  const foot = (t) => { const f = root.querySelector('.fx span'); if (f) f.textContent = t }

  async function draw() {
    if (busy) { again = true; return } busy = true
    try {
      let wallets = [], name = ''
      if (token.get()) { try { const p = (await api('me')).profile; wallets = p.wallets; name = p.name } catch { token.set(null) } }
      const [f, px] = await Promise.all([
        fetch(SITE + '/api/fees').then((r) => r.json()),
        fetch('https://lite-api.jup.ag/price/v3?ids=' + WSOL).then((r) => r.json()).then((j) => j[WSOL]?.usdPrice).catch(() => 0),
      ])
      const rows = f.coins || [], mints = new Set(window.DZZ_MY_MINTS || [])
      const mine = new Set(wallets); for (const r of rows) if (mints.has(r.mint) && r.dev) mine.add(r.dev)
      let claimed = 0, waiting = 0, coins = 0, other = 0; const pumpSeen = new Set()
      for (const r of rows) {
        if (!mine.has(r.dev)) continue; coins++
        if (r.generated == null) { other++; continue }
        if (r.venue !== 'meteora') { if (pumpSeen.has(r.dev)) continue; pumpSeen.add(r.dev) }
        claimed += r.claimed || 0; waiting += r.waiting || 0
      }
      const who = name ? `profile ${esc(name)} · ${mine.size} wallet${mine.size === 1 ? '' : 's'}` : mine.size ? `${mine.size} wallet${mine.size === 1 ? '' : 's'} from this app's launches` : 'no wallets yet'
      const act = token.get() ? `<a href="${SITE}/me" target="_blank" rel="noopener">Profile ↗</a>` : local ? '<button type="button" data-signin>Sign in to add all your wallets</button>' : '<a href="/me">Sign in to add all your wallets</a>'
      root.innerHTML = `<div class="ft">
  <div><b>${sol(claimed)}<small>SOL</small></b><span>collected <i>${usd(claimed, px)}</i></span></div>
  <div><b>${sol(waiting)}<small>SOL</small></b><span>waiting to collect <i>${usd(waiting, px)}</i></span></div>
  <div><b>${sol(claimed + waiting)}<small>SOL</small></b><span>earned in total, ${coins} coin${coins === 1 ? '' : 's'} <i>${usd(claimed + waiting, px)}</i></span></div>
</div><div class="fx"><span>${who}${other ? ` · ${other} coin${other > 1 ? 's' : ''} not priced` : ''}${f.reading ? ' · still reading some wallets' : ''}</span>${act}</div>`
      root.querySelector('[data-signin]')?.addEventListener('click', signIn)
      if (f.reading) setTimeout(draw, 25000)
    } catch { root.innerHTML = '<div class="fx"><span>Could not read your fees just now.</span></div>' }
    finally { busy = false; if (again) { again = false; draw() } }
  }
  window.DzzFeesTotal = { refresh: draw }
  draw()
})()
