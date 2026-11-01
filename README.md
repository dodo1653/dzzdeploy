# dzz

Launch pump.fun coins at the contract address you choose.

- `/` the landing page (its hero searches for addresses live in the visitor's browser, 2 threads)
- `/app` the launcher: the address search runs in the browser (`assets/dzz.wasm` on every core through
  `assets/grind-worker.js` / `assets/engine.js`), keys stay in that browser's storage, the launch is signed in the page
  (`assets/launcher.js`, the launch kit with `mint` + `signMint`) and sent straight to Solana from the visitor's wallet.
- `/api/r?path=upload` stores the coin's picture + metadata in Vercel Blob (connect a Blob store to the project).
- `m/`, `i/` metadata saved by the desktop dzz (served as-is).
- Themes: `assets/theme.js` (data-theme on <html>, picker on [data-theme-picker]). Background: `assets/bg.js`
  (fluted-glass WebGL shader that follows the theme and the search).

The engine source is `forge/wasm` (Rust → wasm32: point stepping + batch inversion, ~0.9M keys/s per thread).
