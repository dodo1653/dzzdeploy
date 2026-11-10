// dzz background: columns of light. A row of crisp vertical bars rises from the bottom of the page in a soft V (tall at
// the sides, low in the middle, where the content sits), each bar a gradient from the theme's light up into the dark.
// The bars breathe on their own, surge while dzz is searching (DZZBG.activity), send a wave out from the centre when an
// address is found (DZZBG.flash), and lean toward the cursor. Canvas 2D, about 30 bars, paused in hidden tabs, still
// when motion is reduced. <body data-bg="soft"> draws it quieter (the app); "full" is the default (landing, login).
//   DZZBG.activity(0..1)   DZZBG.flash()
;(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const cv = document.createElement('canvas'); cv.id = 'dzz-bg'; cv.setAttribute('aria-hidden', 'true')
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block'
  const mount = () => document.body.prepend(cv)
  document.body ? mount() : addEventListener('DOMContentLoaded', mount)
  const ctx = cv.getContext('2d', { alpha: false })
  const hex = (h, d = [8, 9, 11]) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return d; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
  const read = () => { const t = window.DZZTheme?.get?.(); const cs = getComputedStyle(document.documentElement); return { g1: t?.g1 || cs.getPropertyValue('--g1') || '#1f4fd6', g2: t?.g2 || cs.getPropertyValue('--g2') || '#5f9bff', bg: t?.bg || cs.getPropertyValue('--bg') || '#08090b', dark: t ? t.dark : true } }
  let theme = read(), act = 0, actT = 0, wave = -1, mx = .5, smx = .5, W = 0, H = 0, dpr = 1, t0 = performance.now(), raf = 0
  window.DZZBG = { activity: (v) => (actT = Math.max(0, Math.min(1, +v || 0))), flash: () => (wave = 0) }
  addEventListener('dzz-theme', () => { theme = read(); if (still) draw(performance.now()) })
  addEventListener('pointermove', (e) => { mx = e.clientX / Math.max(1, innerWidth) }, { passive: true })
  const soft = () => (document.body?.dataset.bg === 'soft' ? 0.55 : 1)

  function size() { dpr = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
  addEventListener('resize', () => { size(); if (still) draw(performance.now()) })

  function draw(now) {
    const t = (now - t0) / 1000, k = soft()
    act += (actT - act) * 0.04; smx += (mx - smx) * 0.05
    if (wave >= 0) { wave += 0.016; if (wave > 1.6) wave = -1 }
    const [br, bgc, bb] = hex(theme.bg), [r1, g1, b1] = hex(theme.g1, [31, 79, 214]), [r2, g2, b2] = hex(theme.g2, [95, 155, 255])
    ctx.fillStyle = `rgb(${br},${bgc},${bb})`; ctx.fillRect(0, 0, W, H)
    const n = Math.max(14, Math.round(W / 44)), bw = W / n, light = theme.dark !== false
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n, d = Math.abs(x - 0.5) * 2                        // 0 centre .. 1 edge
      let h = 0.30 + 0.52 * Math.pow(d, 1.35)                                    // the V
      h += Math.sin(t * 0.55 + i * 0.47) * 0.035 + Math.sin(t * 0.23 - i * 0.21) * 0.03
      h += act * (0.07 + 0.05 * Math.sin(t * 2.2 + i * 0.9))                     // searching
      h += Math.exp(-Math.pow((x - smx) * 7, 2)) * 0.05                          // cursor
      if (wave >= 0) h += Math.exp(-Math.pow((d - wave) * 6, 2)) * 0.16          // found
      h = Math.max(0.12, Math.min(0.98, h)) * (0.82 + 0.18 * k)
      const top = H * (1 - h), a = (light ? 0.95 : 0.55) * (0.55 + 0.45 * k) * (0.86 + 0.14 * Math.sin(t * 0.8 + i * 1.7))
      const gr = ctx.createLinearGradient(0, top, 0, H)
      gr.addColorStop(0, `rgba(${r1},${g1},${b1},0)`)
      gr.addColorStop(0.55, `rgba(${r1},${g1},${b1},${0.38 * a})`)
      gr.addColorStop(1, `rgba(${r2},${g2},${b2},${0.92 * a})`)
      ctx.fillStyle = gr
      ctx.fillRect(Math.floor(i * bw), top, Math.ceil(bw) - (i % 2 ? 0 : 0), H - top)
      // a hairline seam between bars, and every other bar a touch darker, so the columns read crisp
      if (i % 2) { ctx.fillStyle = `rgba(${br},${bgc},${bb},0.16)`; ctx.fillRect(Math.floor(i * bw), top, Math.ceil(bw), H - top) }
      ctx.fillStyle = `rgba(${br},${bgc},${bb},0.35)`; ctx.fillRect(Math.floor(i * bw), top, 1, H - top)
    }
    // a low glow along the floor, and a dark pool at the top centre where headlines sit
    const fl = ctx.createLinearGradient(0, H * 0.72, 0, H)
    fl.addColorStop(0, `rgba(${r2},${g2},${b2},0)`); fl.addColorStop(1, `rgba(${r2},${g2},${b2},${(light ? 0.22 : 0.12) * k})`)
    ctx.fillStyle = fl; ctx.fillRect(0, H * 0.72, W, H * 0.28)
    const pool = ctx.createRadialGradient(W / 2, H * 0.08, 0, W / 2, H * 0.08, Math.max(W, H) * 0.62)
    pool.addColorStop(0, `rgba(${r1},${g1},${b1},${0.16 * k})`); pool.addColorStop(0.35, `rgba(${br},${bgc},${bb},0.0)`); pool.addColorStop(1, `rgba(${br},${bgc},${bb},0)`)
    ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H)
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.45)
    top.addColorStop(0, `rgba(${br},${bgc},${bb},0.85)`); top.addColorStop(1, `rgba(${br},${bgc},${bb},0)`)
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.45)
  }
  function loop(now) { draw(now); raf = requestAnimationFrame(loop) }
  const start = () => { size(); if (still) draw(performance.now()); else raf = requestAnimationFrame(loop) }
  document.addEventListener('visibilitychange', () => { if (still) return; if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(loop) })
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start()
})()
