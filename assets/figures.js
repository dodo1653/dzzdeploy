// How dzz writes amounts and times. SOL figures: the Solana mark, the whole part in full, the decimals dimmed (.solv in ui.css).
// Times are the browser's own time zone. Amounts come in lamports.
;(() => {
  const MARK = '<img class="solm" src="/assets/venues/sol.svg" alt="" aria-hidden="true">'
  const dp = (a, short) => (short ? (a >= 1e10 ? 1 : a >= 1e9 ? 2 : a >= 1e6 ? 3 : 4) : a >= 1e9 ? 3 : a >= 1e5 ? 4 : 6)
  // parts of an amount: [sign, whole, decimals]; 0 stays a plain 0. short: fewer decimals, for small spaces
  function parts(l, sign, short) {
    if (l == null || Number.isNaN(l)) return null
    const a = Math.abs(l), s = sign && l ? (l > 0 ? '+' : '−') : l < 0 ? '−' : ''
    if (!a) return [s, '0', '']
    const [w, d] = (a / 1e9).toFixed(dp(a, short)).split('.')
    return [s, Number(w).toLocaleString('en-US'), d ? '.' + d : '']
  }
  // <span class="solv">◎ 1,234.567</span>; opts: sign (+/−), mark (default true), unit (adds a small "SOL")
  function sol(l, o = {}) {
    const p = parts(l, o.sign, o.short); if (!p) return '<span class="solv none">—</span>'
    const tone = o.tone && l ? (l > 0 ? ' gain' : ' loss') : ''
    return `<span class="solv${tone}">${o.mark === false ? '' : MARK}<b>${p[0]}${p[1]}</b><em>${p[2]}</em>${o.unit ? '<u>SOL</u>' : ''}</span>`
  }
  const text = (l, o = {}) => { const p = parts(l, o.sign, o.short); return p ? p.join('') : '—' }
  const usd = (l, px) => (px && l != null ? (l < 0 ? '−$' : '$') + Math.abs((l / 1e9) * px).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
  const pad = (n) => String(n).padStart(2, '0')
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const date = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` }
  const time = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
  function ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000)
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : s < 86400 * 30 ? `${Math.floor(s / 86400)} d ago` : date(t)
  }
  const zone = (() => { try { return new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value || '' } catch { return '' } })()
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  window.DzzFig = { sol, text, usd, date, time, ago, zone, dayKey, MON, MARK }
})()
