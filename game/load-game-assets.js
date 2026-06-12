(function () {
  async function fetchJson(path, options = {}) {
    if (window.FamiliarBotAssetCache) {
      return window.FamiliarBotAssetCache.fetchJson(path, options);
    }

    const response = await fetch(path);
    if (!response.ok) {
      if (options.optional) {
        console.warn(`[GameAssets] optional JSON missing: ${path}`);
        return null;
      }
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  // Bot model / animation binaries (.fbx / .glb) and per-bot json sidecars
  // are NOT preloaded yet — those files are still WIP. The game uses its
  // runtime fallbacks (placeholder cube, CSS silhouette) until they ship.
  // Returning an empty list here keeps the loader from spamming 404s and
  // wasting bandwidth on files that the runtime won't use.
  function collectBotFiles(_bot) {
    return [];
  }

  const SKIP_EXTENSIONS = [".fbx", ".glb", ".gltf"];

  function shouldSkipAsset(asset) {
    if (!asset || !asset.path) return true;
    const lower = String(asset.path).toLowerCase().split("?")[0];
    return SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  async function loadGameAssets(manifestPath = "./game_assets.json", onProgress) {
    // The game manifest itself may not be bundled yet while the bot pipeline
    // is still WIP. In that case we return null and the game runs entirely
    // on its built-in placeholder bots / arena fallback.
    const manifest = await fetchJson(manifestPath, { optional: true });
    if (!manifest) {
      console.warn(`[GameAssets] manifest ${manifestPath} not available — using placeholder bots.`);
      return null;
    }

    const files = [
      manifest.loadingScreen?.config,
      manifest.loadingScreen?.background,
      manifest.roster,
      manifest.weaponCatalog,
      manifest.weaponSwapRules,
      manifest.powerCatalog,
      ...((manifest.bots || []).flatMap(collectBotFiles))
    ]
      .filter(Boolean)
      .map((asset) => typeof asset === "string" ? { path: asset } : asset)
      .filter((asset) => !shouldSkipAsset(asset));

    let loaded = 0;
    for (const asset of files) {
      const file = asset.path;

      try {
        if (window.FamiliarBotAssetCache) {
          await window.FamiliarBotAssetCache.fetchAsset(file, {
            key: asset.key,
            optional: true
          });
        } else {
          const response = await fetch(file, { cache: "force-cache" });
          if (!response.ok) {
            console.warn(`[GameAssets] skipping missing asset (${response.status}): ${file}`);
          } else {
            await response.blob();
          }
        }
      } catch (err) {
        // Bot assets aren't ready yet — don't abort the whole load.
        console.warn(`[GameAssets] skipping asset ${file}: ${err.message}`);
      }

      loaded += 1;

      if (typeof onProgress === "function") {
        onProgress({
          loaded,
          total: files.length,
          file,
          percent: Math.round((loaded / files.length) * 100)
        });
      }
    }

    return manifest;
  }

  window.FamiliarBotGameAssets = { loadGameAssets };
})();
