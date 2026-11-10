// dzz showcase background: columns of light. A row of soft gradient columns rises from the bottom in a V (low in the
// middle, tall at the sides), each one breathing slowly out of step with its neighbours, over a deep base with a glow
// at the top and the floor and a fine film grain. Colours follow the theme (assets/theme.js).
// The page can drive it while scrolling: DZZBARS.set({ amp, glow, shift }) eases toward the given values
//   amp   0..1.3  how tall the columns stand       glow  0..1.5  how bright they are       shift  -1..1  where the V sits
// DZZBARS.pulse() sends a short swell through the columns (a found address).
;(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const css = document.createElement('style')
  css.textContent = `
#dzz-bars { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; background: var(--bars-base, #04060d); }
#dzz-bars .row { position: absolute; inset: 0; display: flex; transform-origin: 50% 100%; will-change: transform, opacity; }
#dzz-bars .col { flex: 1; height: 100%; margin-right: -1px; transform-origin: 50% 100%; transform: scaleY(var(--h)); will-change: transform; }
#dzz-bars .col i { display: block; height: 100%; transform-origin: 50% 100%; background: linear-gradient(to top, var(--bars-c1), var(--bars-c2) 62%, transparent);
  animation: dzzBreath 3s ease-in-out infinite alternate; animation-delay: var(--d); }
@keyframes dzzBreath { from { transform: scaleY(1); opacity: 1 } to { transform: scaleY(1.12); opacity: .94 } }
#dzz-bars .glow { position: absolute; inset: 0; background:
  radial-gradient(circle at 50% 0%, rgba(var(--bars-rgb), .26), transparent 55%),
  radial-gradient(circle at 50% 100%, rgba(var(--bars-rgb2), .2), transparent 55%); }
#dzz-bars .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, var(--bars-base) 0%, transparent 38%); opacity: .9; }
#dzz-bars .grain { position: absolute; inset: -50%; opacity: .07; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  animation: dzzGrain 1.2s steps(6) infinite; }
@keyframes dzzGrain { 0% { transform: translate(0, 0) } 20% { transform: translate(-3%, 2%) } 40% { transform: translate(2%, -3%) } 60% { transform: translate(-2%, -1%) } 80% { transform: translate(3%, 3%) } 100% { transform: translate(0, 0) } }
@media (prefers-reduced-motion: reduce) { #dzz-bars .col i, #dzz-bars .grain { animation: none } }`
  document.head.appendChild(css)

  const root = document.createElement('div'); root.id = 'dzz-bars'; root.setAttribute('aria-hidden', 'true')
  root.innerHTML = '<div class="row"></div><div class="glow"></div><div class="shade"></div><div class="grain"></div>'
  const row = root.querySelector('.row')
  const mount = () => document.body.prepend(root)
  document.body ? mount() : addEventListener('DOMContentLoaded', mount)

  const hex = (h, d) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return d; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  // one vivid light per theme: the columns read as light, not as a tint of the accent
  const LIGHT = { night: [59, 130, 246], cobalt: [47, 107, 255], glacier: [34, 184, 230], jade: [16, 185, 129], ember: [249, 115, 22], orchid: [168, 85, 247], graphite: [156, 163, 175], paper: [59, 130, 246] }
  function paint() {
    const t = window.DZZTheme?.get?.() || {}, dark = t.dark !== false
    const light = LIGHT[t.id] || hex(t.g2 || t.acc, [59, 130, 246]), deep = mix(light, [2, 6, 23], .45)
    const base = dark ? mix([2, 6, 23], light, .03) : [236, 240, 250]
    const s = root.style
    s.setProperty('--bars-base', `rgb(${base})`)
    s.setProperty('--bars-c1', `rgba(${light}, ${dark ? .85 : .55})`)
    s.setProperty('--bars-c2', `rgba(${deep}, ${dark ? .3 : .18})`)
    s.setProperty('--bars-rgb', light.join(',')); s.setProperty('--bars-rgb2', mix(light, [0, 0, 0], .25).join(','))
  }
  paint(); addEventListener('dzz-theme', paint)

  let n = 0, cols = []
  function build() {
    const want = innerWidth < 640 ? 14 : innerWidth < 1100 ? 22 : 28
    if (want === n) return
    n = want; row.innerHTML = ''; cols = []
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div'); c.className = 'col'; c.style.setProperty('--d', `${(i * .5) % 6 - 6}s`)
      c.appendChild(document.createElement('i')); row.appendChild(c); cols.push(c)
    }
    shape()
  }
  // the V, moved sideways by `shift`, plus a passing swell
  let cur = { amp: 1, glow: 1, shift: 0 }, tgt = { ...cur }, swell = -1
  function shape() {
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) - .5 - cur.shift * .25, d = Math.min(1, Math.abs(x) * 2)
      let h = (.3 + .7 * Math.pow(d, 1.2)) * cur.amp
      if (swell >= 0) h += Math.exp(-Math.pow((d - swell) * 5, 2)) * .14
      cols[i].style.setProperty('--h', Math.max(.05, Math.min(1.25, h)).toFixed(4))
    }
    row.style.opacity = Math.max(.15, Math.min(1, cur.glow)).toFixed(3)
  }
  build(); addEventListener('resize', build)

  let raf = 0
  function tick() {
    raf = 0; let moving = false
    for (const k of ['amp', 'glow', 'shift']) { const d = tgt[k] - cur[k]; if (Math.abs(d) > .001) { cur[k] += d * .08; moving = true } else cur[k] = tgt[k] }
    if (swell >= 0) { swell += .025; moving = true; if (swell > 1.4) swell = -1 }
    shape(); if (moving && !still) raf = requestAnimationFrame(tick)
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }
  window.DZZBARS = {
    set(v) { Object.assign(tgt, v); still ? (Object.assign(cur, tgt), shape()) : kick() },
    pulse() { if (!still) { swell = 0; kick() } },
  }
})()
