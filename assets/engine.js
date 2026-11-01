// dzz engine for the browser: a pool of Web Workers running dzz.wasm, plus signing on the main thread.
//   const eng = await DZZ.engine({ threads })
//   eng.start({ prefix, suffix, ci }, { onTick(n, sample), onHit({ mint, scalar }) });  eng.stop()
//   eng.sign(scalarHex, messageBytes) -> Uint8Array(64)   (checked against the address inside the engine first)
;(() => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const base = (document.currentScript?.src || location.href).replace(/[^/]*$/, '')
  const b58 = (b) => {
    const d = [0]
    for (const x of b) { let c = x; for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0 } while (c) { d.push(c % 58); c = (c / 58) | 0 } }
    let s = ''; for (const x of b) { if (x === 0) s += '1'; else break }
    for (let k = d.length - 1; k >= 0; k--) s += A[d[k]]
    return s
  }
  const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)))
  let signer = null
  async function signerWasm() {
    if (signer) return signer
    const { instance } = await WebAssembly.instantiate(await (await fetch(base + 'dzz.wasm')).arrayBuffer(), {})
    return (signer = instance.exports)
  }
  async function engine({ threads } = {}) {
    const n = Math.max(1, Math.min(32, threads || navigator.hardwareConcurrency || 4))
    const workers = await Promise.all(Array.from({ length: n }, () => new Promise((ok) => {
      const w = new Worker(base + 'grind-worker.js'); w.onmessage = (e) => { if (e.data.type === 'ready') ok(w) }
      w.postMessage({ type: 'init', wasm: base + 'dzz.wasm' })
    })))
    let cb = null, live = false
    for (const w of workers) w.onmessage = (e) => {
      const m = e.data; if (m.type !== 'tick' || !live || !cb) return
      cb.onTick?.(m.n, b58(m.sample))
      if (m.hit) cb.onHit?.({ mint: b58(m.hit.key), scalar: hex(m.hit.scalar) })
    }
    return {
      threads: n,
      start(pattern, callbacks) { cb = callbacks; live = true; for (const w of workers) w.postMessage({ type: 'start', prefix: pattern.prefix || '', suffix: pattern.suffix || '', ci: !!pattern.ci }) },
      stop() { live = false; for (const w of workers) w.postMessage({ type: 'stop' }) },
    }
  }
  async function sign(scalarHex, msg) {
    const w = await signerWasm(), io = new Uint8Array(w.memory.buffer, w.io_ptr(), 4096)
    if (msg.length > 4000) throw new Error('message too long')
    io.set(unhex(scalarHex), 0); io.set(msg, 64)
    const ok = w.sign(msg.length), sig = new Uint8Array(w.memory.buffer, w.io_ptr(), 64).slice()
    if (!ok) throw new Error('the address signature did not verify; nothing was sent')
    return sig
  }
  window.DZZ = { engine, sign, b58, ALPHA: A }
})()
