// dzz is invite only: every page asks for the access code first (checked by the store). The pass lasts 30 days.
;(() => {
  const S = 'https://dzz-store.trenchcounty.workers.dev', K = 'dzz.gate'
  const out = () => { try { localStorage.removeItem(K) } catch {} location.replace('/access?next=' + encodeURIComponent(location.pathname + location.search + location.hash)) }
  let t = ''; try { t = localStorage.getItem(K) || '' } catch {}
  if (!t || +(t.split('.')[1] || 0) < Date.now()) { document.documentElement.style.visibility = 'hidden'; return out() }
  fetch(S + '/gate?t=' + encodeURIComponent(t)).then((r) => r.json()).then((j) => { if (!j.ok) out() }).catch(() => {})
})()
