// dzz themes: one set of CSS variables per theme on <html data-theme>, a small picker (any element with
// [data-theme-picker] becomes its button), remembered per browser. Fires a "dzz-theme" event so the background shader
// can follow. Load it in <head> so the page never paints in the wrong theme.
;(() => {
  const T = {
    night:   { name: 'Night',   dark: true,  acc: '#a9bfff', ink: '#0b0d16', g1: '#3b4a78', g2: '#a9bfff', bg: '#0b0b0c' },
    cobalt:  { name: 'Cobalt',  dark: true,  acc: '#6ea8ff', ink: '#041434', g1: '#1f4fd6', g2: '#5f9bff', bg: '#07080f' },
    glacier: { name: 'Glacier', dark: true,  acc: '#7fd8f5', ink: '#03222c', g1: '#0c6e8f', g2: '#7fd8f5', bg: '#060a0d' },
    jade:    { name: 'Jade',    dark: true,  acc: '#62e3b5', ink: '#03261a', g1: '#0b6e52', g2: '#4fd8a6', bg: '#060a09' },
    ember:   { name: 'Ember',   dark: true,  acc: '#ff8e5e', ink: '#2a0e02', g1: '#a6371a', g2: '#ff8a52', bg: '#0b0706' },
    orchid:  { name: 'Orchid',  dark: true,  acc: '#c9a2ff', ink: '#1d0b38', g1: '#5a32b8', g2: '#b48cff', bg: '#09070e' },
    graphite:{ name: 'Graphite',dark: true,  acc: '#ecebe6', ink: '#141413', g1: '#3c3c3a', g2: '#a9a8a2', bg: '#0a0a0a' },
    paper:   { name: 'Paper',   dark: false, acc: '#1d4ed8', ink: '#ffffff', g1: '#9db8ff', g2: '#dbe6ff', bg: '#f2f1ec' },
  }
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}` }
  const KEY = 'dzz-theme2', DEF = 'night'
  const css = Object.entries(T).map(([id, t]) => {
    const d = t.dark
    return `:root[data-theme="${id}"]{--acc:${t.acc};--acc-rgb:${rgb(t.acc)};--acc-ink:${t.ink};--bg:${t.bg};--g1:${t.g1};--g2:${t.g2};` + (d
      ? `--bg2:rgba(255,255,255,.035);--panel:rgba(14,15,20,.72);--panel2:rgba(255,255,255,.05);--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--ink:#eef0f4;--t2:#a7abb5;--t3:#9298a3;--t4:#3b3e46;--card-a:rgba(22,24,32,.78);--card-b:rgba(10,11,16,.82);--c-set:#8d919c;--c-roll:#555963;--in-focus:rgba(255,255,255,.06);--shadow:rgba(0,0,0,.6);color-scheme:dark}`
      : `--bg2:rgba(255,255,255,.7);--panel:rgba(255,255,255,.72);--panel2:#ffffff;--line:rgba(10,20,40,.10);--line2:rgba(10,20,40,.18);--ink:#0e1117;--t2:#4b515c;--t3:#7d838e;--t4:#b9bec7;--card-a:rgba(255,255,255,.88);--card-b:rgba(248,248,246,.9);--c-set:#5b616c;--c-roll:#a5abb5;--in-focus:#ffffff;--shadow:rgba(20,30,60,.16);color-scheme:light}`)
  }).join('\n')
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
  let cur = DEF; try { cur = localStorage.getItem(KEY) || DEF } catch {}
  if (!T[cur]) cur = DEF
  const apply = (id) => {
    cur = T[id] ? id : DEF; document.documentElement.dataset.theme = cur
    try { localStorage.setItem(KEY, cur) } catch {}
    dispatchEvent(new CustomEvent('dzz-theme', { detail: { id: cur, ...T[cur] } }))
    document.querySelectorAll('.dzz-themes button').forEach((b) => b.classList.toggle('on', b.dataset.t === cur))
  }
  document.documentElement.dataset.theme = cur
  // the picker: a popover of swatches under whatever is marked [data-theme-picker]
  const pcss = document.createElement('style')
  pcss.textContent = `.dzz-themes{position:fixed;z-index:50;padding:8px;border-radius:14px;border:1px solid var(--line2);background:var(--panel);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 24px 60px var(--shadow);display:grid;gap:2px;min-width:180px;opacity:0;transform:translateY(-6px) scale(.98);pointer-events:none;transition:opacity .22s,transform .3s cubic-bezier(.2,.8,.2,1)}
.dzz-themes.on{opacity:1;transform:none;pointer-events:auto}
.dzz-themes button{display:flex;align-items:center;gap:10px;border:0;background:none;color:var(--t2);font:500 13px Geist,system-ui,sans-serif;padding:8px 10px;border-radius:9px;cursor:pointer;text-align:left}
.dzz-themes button:hover{background:var(--panel2);color:var(--ink)} .dzz-themes button.on{color:var(--ink)}
.dzz-themes i{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 0 0 1px rgba(0,0,0,.25)} .dzz-themes button.on::after{content:'';margin-left:auto;width:6px;height:6px;border-radius:50%;background:var(--acc)}`
  document.head.appendChild(pcss)
  addEventListener('DOMContentLoaded', () => {
    const pop = document.createElement('div'); pop.className = 'dzz-themes'
    pop.innerHTML = Object.entries(T).map(([id, t]) => `<button data-t="${id}"><i style="background:radial-gradient(circle at 35% 30%, ${t.g2}, ${t.g1} 70%)"></i>${t.name}</button>`).join('')
    document.body.appendChild(pop)
    pop.onclick = (e) => { const b = e.target.closest('button'); if (b) { apply(b.dataset.t); window.dzzClick?.() } }
    document.querySelectorAll('[data-theme-picker]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation(); const r = btn.getBoundingClientRect()
      pop.style.top = r.bottom + 8 + 'px'; pop.style.left = Math.min(innerWidth - 196, Math.max(8, r.right - 180)) + 'px'; pop.classList.toggle('on')
    }))
    addEventListener('click', (e) => { if (!e.target.closest('.dzz-themes')) pop.classList.remove('on') })
    apply(cur)
  })
  window.DZZTheme = { themes: T, apply, get: () => ({ id: cur, ...T[cur] }) }
})()
