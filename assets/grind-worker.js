// One grinding thread: the WebAssembly engine (dzz.wasm) walking secret scalars a, a+1, … and reporting how many keys it
// checked, one real sample address, and any match. The starting point comes from crypto.getRandomValues.
let w = null, running = false, gen = 0
const io = () => new Uint8Array(w.memory.buffer, w.io_ptr(), 4096)
const enc = new TextEncoder()

onmessage = async (e) => {
  const m = e.data
  if (m.type === 'init') {
    const { instance } = await WebAssembly.instantiate(await (await fetch(m.wasm)).arrayBuffer(), {})
    w = instance.exports; postMessage({ type: 'ready' })
  } else if (m.type === 'start') {
    const b = io(), seed = new Uint8Array(64); crypto.getRandomValues(seed)
    b.set(seed, 0); b[64] = m.suffix.length; b[65] = m.prefix.length; b[66] = m.ci ? 1 : 0
    b.fill(0, 80, 112); b.set(enc.encode(m.suffix), 80); b.set(enc.encode(m.prefix), 96)
    w.init(); running = true; loop(++gen)
  } else if (m.type === 'stop') running = false
}

function loop(g) {
  if (!running || g !== gen) return
  const t = performance.now(); let n = 0, hit = null
  while (performance.now() - t < 120) {
    const r = w.step(2); n += 512
    if (r === 1) { const b = io(); hit = { key: b.slice(128, 160), scalar: b.slice(160, 192) }; break }
  }
  postMessage({ type: 'tick', n, sample: io().slice(192, 224), hit })
  setTimeout(() => loop(g), 0)
}
