// dzz accounts in the browser: one session token (localStorage 'dzz.profile') for the profile kept by the dzz store.
// Sign in with Google, Discord, X or a Solana wallet; every wallet you link joins the same profile.
//   DzzAuth.token()                  the session token or null
//   DzzAuth.me()                     → profile {id, name, avatar, wallets, identities} or null (cached for the page)
//   DzzAuth.providers()              → {google, discord, x}: which sign-ins are switched on
//   DzzAuth.oauth(provider, {link})  go to Google / Discord / X; comes back to this page signed in (or linked)
//   DzzAuth.signInWallet()           sign a message with the wallet in the browser
//   DzzAuth.linkWallet()             add the wallet that is active now to the signed-in profile
//   DzzAuth.unlinkWallet(w) / unlinkIdentity(p) / rename(name) / signOut()
// A page that is opened with #dzz_token=… (back from Google etc.) is signed in by loading this file; #dzz_error=… lands
// in DzzAuth.lastError. Events: 'dzz-auth' on window whenever the profile changes.
;(() => {
  const STORE = 'https://dzz-store.trenchcounty.workers.dev'
  const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const enc58 = (b) => { let n = 0n; for (const x of b) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n } for (const x of b) { if (x) break; s = '1' + s } return s }
  const KEY = 'dzz.profile'
  const tok = { get: () => { try { return localStorage.getItem(KEY) } catch { return null } }, set: (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch {} } }
  let lastError = '', cached = null, provCache = null

  // back from a provider: the token (or the error) rides in the hash; take it and clean the address bar
  if (/[#&]dzz_(token|error)=/.test(location.hash)) {
    const h = new URLSearchParams(location.hash.slice(1))
    if (h.get('dzz_token')) tok.set(h.get('dzz_token'))
    if (h.get('dzz_error')) lastError = h.get('dzz_error')
    h.delete('dzz_token'); h.delete('dzz_error')
    const rest = h.toString()
    history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''))
  }

  async function api(path, body, t = tok.get()) {
    const r = await fetch(STORE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const j = await r.json().catch(() => ({ error: 'the account service did not answer' }))
    if (j.error) { if (r.status === 401 && t && /sign in/i.test(j.error)) { tok.set(null); cached = null; emit() } throw new Error(j.error) }
    return j
  }
  const emit = () => dispatchEvent(new CustomEvent('dzz-auth', { detail: cached }))
  const set = (p) => { cached = p || null; emit(); return cached }
  const provider = () => window.phantom?.solana || window.solflare || window.backpack?.solana || window.backpack || window.solana || null
  async function activeWallet() { const p = provider(); if (!p) throw new Error('No Solana wallet in this browser. Install Phantom, Solflare or Backpack.'); const r = await p.connect(); return { p, w: (r?.publicKey || p.publicKey).toString() } }
  async function sign(p, text) { const s = await p.signMessage(new TextEncoder().encode(text), 'utf8'); return enc58(s.signature || s) }

  window.DzzAuth = {
    STORE, get lastError() { return lastError }, short: (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '—'),
    token: () => tok.get(),
    async me(fresh) {
      if (!tok.get()) return set(null)
      if (cached && !fresh) return cached
      try { return set((await api('/p/me')).profile) } catch { return cached }
    },
    async providers() {
      if (provCache) return provCache
      try { provCache = await (await fetch(STORE + '/auth/providers')).json() } catch { provCache = { google: false, discord: false, x: false } }
      return provCache
    },
    oauth(p, { link = false, back = location.href.split('#')[0] } = {}) {
      const q = new URLSearchParams({ return: back }); if (link && tok.get()) q.set('link', tok.get())
      location.href = `https://dzzdeploy.vercel.app/auth/${p}/start?${q}`   // the site's own address, proxied to the account server
    },
    async signInWallet() {
      const { p, w } = await activeWallet(), { nonce } = await api('/p/nonce', {})
      const r = await api('/p/signin', { wallet: w, nonce, signature: await sign(p, `dzz sign-in\nwallet: ${w}\nnonce: ${nonce}`) }, null)
      tok.set(r.token); return set(r.profile)
    },
    async linkWallet() {
      const me = await this.me(); if (!me) return this.signInWallet()
      const { p, w } = await activeWallet()
      if (me.wallets.includes(w)) throw new Error(`${this.short(w)} is already on your profile. Switch to another wallet in your wallet app first.`)
      const { nonce } = await api('/p/nonce', {})
      return set((await api('/p/link', { wallet: w, nonce, signature: await sign(p, `dzz link wallet\nprofile: ${me.id}\nwallet: ${w}\nnonce: ${nonce}`) })).profile)
    },
    async unlinkWallet(wallet) { return set((await api('/p/unlink', { wallet })).profile) },
    async unlinkIdentity(provider) { return set((await api('/p/unlink-identity', { provider })).profile) },
    async rename(name) { return set((await api('/p/name', { name })).profile) },
    // kind 'avatar' | 'banner'; one of { data: 'data:image/...' } | { preset: 'preset:id' } | { url: <a connected account's picture> } | { clear: true }
    async setImage(kind, v) { return set((await api('/p/image', { kind, ...v })).profile) },
    signOut() { tok.set(null); set(null) },
  }
})()
