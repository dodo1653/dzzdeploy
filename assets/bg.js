// dzz background: a survey map. Topographic contour lines drawn from a slowly drifting height field (marching squares),
// a fine grid of + marks with brighter survey marks every fourth crossing, and, on pages with <body data-hud>, a range
// dial in the top right: tick ring, crosshair, a sweeping arc and live bearing / range labels.
// The field drifts faster while dzz is searching (DZZBG.activity) and a found address sends a ring out from the dial
// (DZZBG.flash). Canvas 2D at a low frame rate, paused in hidden tabs, still when motion is reduced.
// <body data-bg="soft"> draws it quieter (the app).
;(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const cv = document.createElement('canvas'); cv.id = 'dzz-bg'; cv.setAttribute('aria-hidden', 'true')
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block'
  const mount = () => document.body.prepend(cv)
  document.body ? mount() : addEventListener('DOMContentLoaded', mount)
  const ctx = cv.getContext('2d', { alpha: false })
  const hex = (h, d) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return d; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
  const read = () => { const t = window.DZZTheme?.get?.(); return { bg: hex(t?.bg, [11, 11, 12]), acc: hex(t?.acc, [157, 183, 255]), dark: t ? t.dark !== false : true } }
  let theme = read(), act = 0, actT = 0, ring = -1, W = 0, H = 0, dpr = 1, raf = 0, last = 0, T = 0
  window.DZZBG = { activity: (v) => (actT = Math.max(0, Math.min(1, +v || 0))), flash: () => (ring = 0) }
  addEventListener('dzz-theme', () => { theme = read(); if (still) draw() })

  // ---------------------------------------------------------------- value noise
  const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]] } for (let i = 0; i < 512; i++) P[i] = p[i & 255] }
  const fade = (t) => t * t * (3 - 2 * t)
  const h2 = (x, y) => P[P[x & 255] + (y & 255)] / 255
  function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf }
  const field = (x, y, t) => vn(x + t * .35, y - t * .2) * .62 + vn(x * 2.1 - t * .25 + 31.7, y * 2.1 + 17.3) * .26 + vn(x * 4.3 + 7.1, y * 4.3 - t * .4) * .12

  const CELL = 14, LEVELS = 13
  let gx = 0, gy = 0, vals = null
  function size() {
    dpr = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    gx = Math.ceil(W / CELL) + 2; gy = Math.ceil(H / CELL) + 2; vals = new Float32Array(gx * gy)
  }
  addEventListener('resize', () => { size(); draw() })            // resizing clears the canvas: repaint at once, not on the next frame

  function contours(t) {
    const sc = 1 / 260
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) vals[j * gx + i] = field(i * CELL * sc, j * CELL * sc, t)
    const [r, g, b] = theme.dark ? [255, 255, 255] : [20, 24, 32], k = document.body?.dataset.bg === 'soft' ? .6 : 1
    for (let L = 1; L < LEVELS; L++) {
      const lv = L / LEVELS, major = L % 4 === 0
      ctx.beginPath()
      for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
        const a = vals[j * gx + i], bb = vals[j * gx + i + 1], c = vals[(j + 1) * gx + i + 1], d = vals[(j + 1) * gx + i]
        const idx = (a > lv) | ((bb > lv) << 1) | ((c > lv) << 2) | ((d > lv) << 3); if (idx === 0 || idx === 15) continue
        const x = i * CELL, y = j * CELL, f = (p, q) => (lv - p) / (q - p)
        const T_ = [x + CELL * f(a, bb), y], R_ = [x + CELL, y + CELL * f(bb, c)], B_ = [x + CELL * f(d, c), y + CELL], L_ = [x, y + CELL * f(a, d)]
        const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]) }
        switch (idx) {
          case 1: case 14: seg(L_, T_); break
          case 2: case 13: seg(T_, R_); break
          case 3: case 12: seg(L_, R_); break
          case 4: case 11: seg(R_, B_); break
          case 5: seg(L_, T_); seg(R_, B_); break
          case 6: case 9: seg(T_, B_); break
          case 7: case 8: seg(L_, B_); break
          case 10: seg(T_, R_); seg(L_, B_); break
        }
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${(major ? .085 : .045) * k})`; ctx.lineWidth = major ? 1.1 : 1; ctx.stroke()
    }
  }

  function marks() {
    const [r, g, b] = theme.dark ? [255, 255, 255] : [20, 24, 32], [ar, ag, ab] = theme.acc, k = document.body?.dataset.bg === 'soft' ? .7 : 1
    const S = 56, ox = (W / 2) % S, oy = 28
    ctx.beginPath()
    for (let y = oy; y < H; y += S) for (let x = ox; x < W; x += S) { ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5) }
    ctx.strokeStyle = `rgba(${r},${g},${b},${.11 * k})`; ctx.lineWidth = 1; ctx.stroke()
    ctx.beginPath()
    for (let y = oy; y < H; y += S * 4) for (let x = ox; x < W; x += S * 4) { ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6) }
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},${.38 * k})`; ctx.stroke()
  }

  function hud(t) {
    if (!document.body?.hasAttribute('data-hud') || W < 760) return
    const [ar, ag, ab] = theme.acc, ink = theme.dark ? '255,255,255' : '20,24,32'
    const R = Math.min(170, W * .11 + 40), cx = W - R - Math.max(60, W * .09), cy = R + 70
    ctx.save(); ctx.lineWidth = 1
    // tick ring
    ctx.beginPath()
    for (let a = 0; a < 360; a += 2) { const big = a % 10 === 0, r0 = R - (big ? 9 : 4), rad = a * Math.PI / 180; ctx.moveTo(cx + Math.cos(rad) * r0, cy + Math.sin(rad) * r0); ctx.lineTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R) }
    ctx.strokeStyle = `rgba(${ink},.16)`; ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${ink},.12)`; ctx.stroke()
    ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.arc(cx, cy, R * .62, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${ink},.12)`; ctx.stroke(); ctx.setLineDash([])
    // crosshair
    ctx.beginPath(); ctx.moveTo(cx - R - 26, cy); ctx.lineTo(cx + R + 26, cy); ctx.moveTo(cx, cy - R - 26); ctx.lineTo(cx, cy + R + 26); ctx.strokeStyle = `rgba(${ink},.14)`; ctx.stroke()
    // sweeping arc
    const sw = t * .45 + act * t * .3
    ctx.beginPath(); ctx.arc(cx, cy, R * .38, sw, sw + .9); ctx.strokeStyle = `rgba(${ar},${ag},${ab},.55)`; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1
    // a found address: a ring out from the dial
    if (ring >= 0) { ctx.beginPath(); ctx.arc(cx, cy, R * (.2 + ring * 1.1), 0, Math.PI * 2); ctx.strokeStyle = `rgba(${ar},${ag},${ab},${Math.max(0, .5 - ring * .5)})`; ctx.stroke() }
    // corner brackets
    const bx = R + 18, L = 12
    ctx.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = cx + sx * bx, y = cy + sy * bx; ctx.moveTo(x, y - sy * L); ctx.lineTo(x, y); ctx.lineTo(x - sx * L, y) }
    ctx.strokeStyle = `rgba(${ink},.22)`; ctx.stroke()
    // labels
    const brg = ((sw * 180 / Math.PI) % 360 + 360) % 360, rng = 1.2 + (Math.sin(t * .13) + 1) * .4
    ctx.font = '500 10.5px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = `rgba(${ar},${ag},${ab},.7)`
    ctx.fillText(`DZ-01  BRG ${String(Math.round(brg)).padStart(3, '0')}°`, cx - bx, cy - bx - 22)
    ctx.fillText(`RNG ${rng.toFixed(2)}KM`, cx - bx, cy - bx - 9)
    ctx.restore()
  }

  function draw() {
    const [br, bgc, bb] = theme.bg
    ctx.fillStyle = `rgb(${br},${bgc},${bb})`; ctx.fillRect(0, 0, W, H)
    contours(T); marks(); hud(T)
    // keep the middle calm for text
    const v = ctx.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .1, W / 2, H * .45, Math.max(W, H) * .75)
    v.addColorStop(0, `rgba(${br},${bgc},${bb},.35)`); v.addColorStop(.6, `rgba(${br},${bgc},${bb},0)`); v.addColorStop(1, `rgba(${br},${bgc},${bb},.4)`)
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
  }
  function loop(now) {
    raf = requestAnimationFrame(loop)
    if (now - last < 66) return                          // ~15 fps is plenty for a drifting map
    const dt = Math.min(.2, (now - (last || now)) / 1000); last = now
    act += (actT - act) * .05; T += dt * (.05 + act * .25)
    if (ring >= 0) { ring += dt * .7; if (ring > 1.2) ring = -1 }
    draw()
  }
  const start = () => { size(); draw(); if (!still) raf = requestAnimationFrame(loop) }
  document.addEventListener('visibilitychange', () => { if (still) return; if (document.hidden) cancelAnimationFrame(raf); else { last = 0; raf = requestAnimationFrame(loop) } })
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start()
})()
