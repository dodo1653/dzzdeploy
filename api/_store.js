// dzz's file store on Cloudflare (dzz-store Worker), in place of Vercel Blob (suspended on the Hobby plan, 2026-11-06).
// Reads are public; writes carry STORE_KEY. Pictures and metadata (i/, m/) are permanent and can't be overwritten.
export const STORE = process.env.STORE_URL || 'https://dzz-store.trenchcounty.workers.dev'
export const urlOf = (name) => `${STORE}/s/${name}`
export async function put(name, body, contentType = 'application/json') {
  const r = await fetch(urlOf(name), { method: 'PUT', headers: { authorization: 'Bearer ' + (process.env.STORE_KEY || ''), 'content-type': contentType }, body })
  if (!r.ok) throw new Error(`store refused ${name}: ${r.status} ${(await r.text()).slice(0, 80)}`)
  return { url: urlOf(name) }
}
export async function getJson(name) {
  try { const r = await fetch(urlOf(name) + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) return await r.json() } catch {}
  return null
}
