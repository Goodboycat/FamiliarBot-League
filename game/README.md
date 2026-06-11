# FamiliarBot League Game Assets

This folder is the game-facing entry point for loading assets from the repository.

Use `game_assets.json` when the game starts. It points to the loading screen, bot roster, bot models, animations, powers, weapons, and weapon loadouts in their repository locations.

The actual FBX, OBJ, PNG, and JSON assets stay under `assets/` so they are not duplicated.

## Cloudflare Pages

Cloudflare Pages uses the `npm run build` script to create `dist/`.

For web delivery, bot model FBX files are converted to GLB and optimized with `gltfpack`. The original model FBX files remain in the repository as source assets, while the Cloudflare build ships the smaller `.glb` models and excludes the source model FBX files from `dist/`.

Runtime animations stay as FBX files in the Cloudflare build so the game keeps the original animation set while still using optimized GLB bot models.

## Asset Cache

`asset-cache.js` stores downloaded runtime assets in IndexedDB under `FamiliarBotAssets`. This lets the browser download large model, animation, and image files once, then reuse them on later visits.

Bump `DB_VERSION` in `game/asset-cache.js` when a release needs players to re-download cached assets.

Use `FamiliarBotGLBLoader.loadGLB(url, key)` when code needs a parsed GLB:

```js
const atlas = await FamiliarBotGLBLoader.loadGLB(
  "./assets/bots/atlas/model/atlas_all_rounder.glb",
  "atlas_model_runtime_v2"
);
```

The first call downloads and saves the GLB in IndexedDB. Later calls read the cached blob and parse it with `GLTFLoader` when that loader is available.

## Load Order

1. Show `loadingScreen.config`.
2. Load `roster`.
3. Load each entry in `bots`.
4. Load each bot's model, animations, power file, weapon file, and loadout file.
5. Enter the game once all required assets are ready.
