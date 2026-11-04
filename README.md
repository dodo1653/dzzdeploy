# dzz

Launch coins on pump.fun or Meteora at the contract address you choose.

- `/` the landing page (its hero searches for addresses live in the visitor's browser, 2 threads)
- `/app` the launcher: the address search runs in the browser (`assets/dzz.wasm` on every core through
  `assets/grind-worker.js` / `assets/engine.js`), keys stay in that browser's storage, the launch is signed in the page
  (`assets/launcher.js`, the launch kit with `mint` + `signMint`) and sent straight to Solana from the visitor's wallet.
- `/api/r?path=upload` stores the coin's picture + metadata in Vercel Blob (connect a Blob store to the project).
- `m/`, `i/` metadata saved by the desktop dzz (served as-is).
- Themes: `assets/theme.js` (data-theme on <html>, picker on [data-theme-picker]). Background: `assets/bg.js`
  (fluted-glass WebGL shader that follows the theme and the search).

The engine source is `forge/wasm` (Rust → wasm32: point stepping + batch inversion, ~0.9M keys/s per thread).

## Meteora

`assets/meteora.js` (from `launch-tech/kit/browser/meteora.js`, bundled by `build.mjs`) launches on Meteora's Dynamic Bonding Curve and loads only when someone picks Meteora. Each launch creates its own config and pool, so no partner key is involved. SOL pair, Token-2022, 1B supply, mint, freeze and update authority revoked, liquidity locked for good at graduation. Trading fees stay in the pool until claimed with the **fees** button in the Launched list. About 0.0085 SOL a launch. Launches with the same settings share one config, whose address comes from the settings: the first launch of a combination creates it (about 0.0145 SOL), and so does any launch with a fee wallet. Because the shared key is public, every launch checks that the config matches byte for byte what those settings would write, and uses a private config if it does not.
