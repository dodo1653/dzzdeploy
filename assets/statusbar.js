// dzz status bar: a slim strip fixed to the bottom of the page.
//   left    account status, My coins, Theme, Sound (when the page has sound)
//   centre  pump.fun graduation market cap, SOL / USD, MET (Meteora) / USD, each with its 24 h change
//   right   network latency to Solana, this device's address speed (when a page reports it)
// Prices from Jupiter, every 30 s. Pages can report speed with DzzStatus.speed(addressesPerSecond).
;(() => {
  const SOL = 'So11111111111111111111111111111111111111112', MET = 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL'
  const RPC = 'https://solana-rpc.publicnode.com', GRAD_SOL = 411.2   // pump.fun graduates near this many SOL of market cap
  const css = document.createElement('style')
  css.textContent = `
.sbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; height: 32px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; gap: 10px;
  border-top: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); font: 500 12px var(--ui); color: var(--t3); }
.sbar .grp { display: flex; align-items: center; gap: 2px; min-width: 0; }
.sbar .mid { position: absolute; left: 50%; top: 0; bottom: 0; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; }
.sbar .it { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: 6px; border: 0; background: none; color: inherit; font: inherit; text-decoration: none; white-space: nowrap; cursor: default; position: relative; }
.sbar a.it, .sbar button.it { cursor: pointer; transition: background .15s, color .15s; } .sbar a.it:hover, .sbar button.it:hover { background: var(--s2); color: var(--ink); }
.sbar .it svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.sbar .it img { width: 14px; height: 14px; border-radius: 50%; flex: none; }
.sbar .num { font-variant-numeric: tabular-nums; color: var(--t2); } .sbar .up { color: var(--ok); } .sbar .dn { color: var(--bad); }
.sbar .chg { font-size: 11px; }
.sbar .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--t4); box-shadow: 0 0 0 2px rgba(255,255,255,.06); flex: none; }
.sbar .dot.ok { background: #34d399; box-shadow: 0 0 0 2px rgba(52,211,153,.25); } .sbar .dot.warn { background: #fbbf24; box-shadow: 0 0 0 2px rgba(251,191,36,.25); } .sbar .dot.bad { background: #fb7185; box-shadow: 0 0 0 2px rgba(251,113,133,.25); }
.sbar .sep { width: 1px; height: 14px; background: var(--line); margin: 0 4px; }
.sbar .it[data-tip]:hover::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); padding: 5px 8px; border-radius: 6px; background: var(--pop, #16171c); border: 1px solid var(--line2); color: var(--ink); font: 500 11.5px var(--ui); white-space: nowrap; pointer-events: none; }
body.has-sbar { padding-bottom: 32px; }
@media (max-width: 760px) { .sbar .hide-m { display: none; } .sbar .mid { position: static; transform: none; } .sbar { justify-content: space-between; } }`
  document.head.appendChild(css)
  const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`
  const bar = document.createElement('div'); bar.className = 'sbar'; bar.setAttribute('role', 'contentinfo')
  const inApp = location.pathname.startsWith('/app')
  bar.innerHTML = `<div class="grp">
      <a class="it" id="sbAcct" href="${inApp ? '#account' : '/app'}"><span class="dot" id="sbDot"></span><span id="sbStatus" class="hide-m">Signed out</span></a>
      <a class="it hide-m" href="${inApp ? '#coins' : '/app#coins'}">${ic('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4"/><path d="M12 8v4l3 2"/>')}My coins</a>
      <button class="it hide-m" type="button" data-theme-picker>${ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/>')}Theme</button>
    </div>
    <div class="mid">
      <span class="it hide-m" data-tip="pump.fun graduation market cap">${ic('<rect x="4" y="8" width="16" height="8" rx="4" transform="rotate(-40 12 12)"/><path d="m12 12 3.2-2.7"/>')}<span class="num" id="sbGrad">…</span></span>
      <span class="it" data-tip="SOL / USD, 24 h"><img id="sbSolI" alt=""><span class="num" id="sbSol">…</span><span class="chg" id="sbSolC"></span></span>
      <span class="it" data-tip="MET (Meteora) / USD, 24 h"><img id="sbMetI" alt=""><span class="num" id="sbMet">…</span><span class="chg" id="sbMetC"></span></span>
    </div>
    <div class="grp">
      <span class="it hide-m" id="sbSpeedW" hidden data-tip="Addresses a second on this device">${ic('<path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z"/>')}<span class="num" id="sbSpeed"></span></span>
      <span class="it" data-tip="Latency to Solana"><span class="dot" id="sbNet"></span><span class="num" id="sbPing">…</span></span>
    </div>`
  const mount = () => { document.body.appendChild(bar); document.body.classList.add('has-sbar') }
  document.body ? mount() : addEventListener('DOMContentLoaded', mount)
  const $ = (id) => bar.querySelector('#' + id)
  const usd = (v) => (v >= 100 ? '$' + v.toFixed(2) : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toFixed(4))
  const chg = (el, p) => { if (p == null || !isFinite(p)) return (el.textContent = ''); el.textContent = (p >= 0 ? '+' : '') + p.toFixed(1) + '%'; el.className = 'chg ' + (p >= 0 ? 'up' : 'dn') }

  async function prices() {
    try {
      const [s, m] = await Promise.all([SOL, MET].map((id) => fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + id).then((r) => r.json()).then((j) => j.find((t) => t.id === id))))
      if (s) { $('sbSol').textContent = usd(s.usdPrice); chg($('sbSolC'), s.stats24h?.priceChange); if (!$('sbSolI').src) $('sbSolI').src = s.icon; $('sbGrad').textContent = '$' + (GRAD_SOL * s.usdPrice / 1000).toFixed(1) + 'K' }
      if (m) { $('sbMet').textContent = usd(m.usdPrice); chg($('sbMetC'), m.stats24h?.priceChange); if (!$('sbMetI').src) $('sbMetI').src = m.icon }
    } catch {}
  }
  async function ping() {
    const t = performance.now()
    try {
      await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"getHealth"}', cache: 'no-store' })
      const ms = Math.round(performance.now() - t); $('sbPing').textContent = ms + 'ms'; $('sbNet').className = 'dot ' + (ms < 150 ? 'ok' : ms < 400 ? 'warn' : 'bad')
    } catch { $('sbPing').textContent = 'offline'; $('sbNet').className = 'dot bad' }
  }
  function account(p) {
    $('sbDot').className = 'dot' + (p ? ' ok' : ''); $('sbStatus').textContent = p ? p.name : 'Signed out'
    if (!p) $('sbAcct').href = '/login'
  }
  addEventListener('dzz-auth', (e) => account(e.detail))
  const boot = () => { prices(); ping(); window.DzzAuth?.me().then(account); setInterval(prices, 30000); setInterval(ping, 20000) }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', boot) : boot()
  const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)))
  window.DzzStatus = { speed(n) { $('sbSpeedW').hidden = !n; $('sbSpeed').textContent = big(n) + '/s' } }
})()
