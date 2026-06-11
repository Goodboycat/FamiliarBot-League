(function () {
  async function fetchJson(path) {
    if (window.FamiliarBotAssetCache) {
      return window.FamiliarBotAssetCache.fetchJson(path);
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  function collectBotFiles(bot) {
    return [
      {
        path: bot.model,
        key: bot.cacheKeys?.model
      },
      bot.power,
      bot.weapon,
      bot.loadout,
      ...Object.entries(bot.animations || {}).map(([name, path]) => ({
        path,
        key: bot.cacheKeys?.animations?.[name]
      }))
    ];
  }

  async function loadGameAssets(manifestPath = "./game_assets.json", onProgress) {
    const manifest = await fetchJson(manifestPath);
    const files = [
      manifest.loadingScreen.config,
      manifest.loadingScreen.background,
      manifest.roster,
      manifest.weaponCatalog,
      manifest.weaponSwapRules,
      manifest.powerCatalog,
      ...manifest.bots.flatMap(collectBotFiles)
    ].map((asset) => typeof asset === "string" ? { path: asset } : asset);

    let loaded = 0;
    for (const asset of files) {
      const file = asset.path;

      if (window.FamiliarBotAssetCache) {
        await window.FamiliarBotAssetCache.fetchAsset(file, { key: asset.key });
      } else {
        const response = await fetch(file, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`Could not preload ${file}`);
        }
        await response.blob();
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
