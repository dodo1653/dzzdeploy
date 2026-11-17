// Frame-accurate renderer (Fivestar film): drives window.renderFrame(t) in headless Edge and saves JPEG frames (PNG with PNG=1).
// usage: node film/render.mjs <url> <outDir> [fps=60] [from=0] [to=DURATION] [times=comma list for stills]
// The Edge profile lives under %TEMP% and is deleted when the run ends (also on timeout / error).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const [url, outDir, FPS = '60', FROM = '0', TO = '', TIMES = ''] = process.argv.slice(2)
const PORT = 9400 + Math.floor(Math.random() * 400)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PROFILE = `${process.env.TEMP}/edge-dzz-render-${PORT}`
const VW = +(process.env.VW || 1920), VH = +(process.env.VH || 1080)
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--ignore-gpu-blocklist', `--window-size=${VW},${VH}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function done(code) {
  try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  await sleep(1000)
  for (let i = 0; i < 30; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break } catch { await sleep(400) } }
  process.exit(code)
}
process.on('uncaughtException', (e) => { console.log('ERROR', e?.message || e); done(3) })
let tg
for (let i = 0; i < 60; i++) { try { tg = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (tg.length) break } catch {} await sleep(200) }
const ws = new WebSocket(tg.find((x) => x.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map(); const errs = []
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description).join(' ')) }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { console.log('TIMEOUT on', method, '- stopping; resume with FROM'); done(2) } }, 60000) })
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) errs.push(r.result.exceptionDetails.exception?.description); return r.result?.result?.value }
await send('Runtime.enable'); await send('Page.enable')
// offline: every request that isn't to this machine is refused (fonts, three.js, everything are served locally)
await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] })
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(2500)
await ev('document.fonts.ready.then(() => true)')
let ok = false
for (let i = 0; i < 300 && !(ok = await ev('window.READY === true')); i++) await sleep(200)
if (!ok) { console.log('page never became READY', errs.join('\n')); await done(4) }
if (process.env.EVAL) { console.log(JSON.stringify(await ev(process.env.EVAL))); ws.close(); await done(0) }
fs.mkdirSync(outDir, { recursive: true })
const dur = TO ? +TO : await ev('window.DURATION')
const times = TIMES ? TIMES.split(',').map(Number) : []
if (!times.length) { const n = Math.round((dur - +FROM) * +FPS); for (let i = 0; i < n; i++) times.push(+FROM + i / +FPS) }
const t0 = Date.now()
for (let i = 0; i < times.length; i++) {
  await ev(`Promise.resolve(window.renderFrame(${times[i]})).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`)
  const png = !!process.env.PNG || !!TIMES
  const s = await send('Page.captureScreenshot', { format: png ? 'png' : 'jpeg', quality: png ? undefined : 93, optimizeForSpeed: true })
  const name = TIMES ? `t${times[i].toFixed(2)}.png` : `f${String(Math.round(times[i] * +FPS)).padStart(5, '0')}.jpg`
  fs.writeFileSync(`${outDir}/${name}`, Buffer.from(s.result.data, 'base64'))
  if (i % 60 === 0) console.log(`frame ${i}/${times.length} t=${times[i].toFixed(2)} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n'))
ws.close(); await done(0)
