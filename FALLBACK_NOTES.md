# FamiliarBot League — Bot Asset Fallbacks

This build does **not** pull binary assets (bot models, animations, music,
icons, loading background) from the GitHub asset repo. All the JS/CSS/HTML
code now degrades gracefully when those files are absent, so the game still
boots and is fully playable end-to-end with placeholders.

## What is missing from this zip (and is OK to be missing)

- `assets/bots/<id>/model/*.glb` and `*.fbx`
- `assets/bots/<id>/animations/*.fbx`
- `assets/bots/<id>/power.json`, `weapon.json`, `loadout.json`
- `assets/music/*.mp3`
- `assets/icons/*.png`
- `assets/ui/loading/loading_background_robot_1280.jpg`

## How the fallbacks work

| Layer | When real asset is missing | Fallback |
| --- | --- | --- |
| `game/asset-cache.js` | Any asset 404s or network errors | Returns `null`, logs `console.warn` instead of throwing |
| `game/load-glb.js` | A bot `.glb` is not on disk | Returns `{ gltf: null, missing: true }`; never throws |
| `game/load-game-assets.js` | `game_assets.json` or any sub-asset missing | Skips with warning; loop still completes |
| `assets/ui/loading/loading-screen.js` | Any preload 404 | Logs `"Skipped <file>"` in the loading bar |
| `assets/ui/loading/loading-screen.js` | Bot `.fbx` / `.glb` / `.gltf` paths in the manifest | Filtered out before the preload loop — only icons + music are downloaded until bot binaries are ready |
| `assets/ui/loading/loading-screen.js` | Reaches 100% | Adds `.loading-screen--dismissed` (fade-out) and removes the `<section>` from the DOM, so it no longer covers the menu |
| `game/load-game-assets.js` | Manifest available but bot files still WIP | `collectBotFiles()` returns `[]` and any remaining `.fbx`/`.glb` paths are filtered — only top-level json manifests are touched |
| `game/game-screen.js` 3D scene | Bot GLB not bundled | Uses placeholder box-mech tinted with that bot's accent color |
| `game/game-screen.js` 3D scene | THREE.js CDN blocked / offline | Falls back to 2D top-down arena |
| `assets/ui/garage/garage-screen.js` | Always (no GLB needed here) | Pure-CSS animated mech silhouette |
| `assets/audio/audio-manager.js` | Music file 404 | Audio element silently fails; game keeps running |
| `scripts/build-cloudflare-pages.mjs` | `assets/bots/` not present | Build skips the missing-dir steps and still emits `dist/` |

## When the real assets arrive

Drop the bot folders / music / icons in at their existing paths
(`assets/bots/<id>/...`, `assets/music/...`, etc.) and the loaders will pick
them up automatically — no code changes required.

The 3D scene also opportunistically tries a list of candidate GLB filenames
in `tryUpgradeBotMesh()` (see `game/game-screen.js`); if a real model is
found it transparently swaps the placeholder cube for the GLB at runtime.
