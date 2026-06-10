(function () {
  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  function collectBotFiles(bot) {
    return [
      bot.model,
      bot.power,
      bot.weapon,
      bot.loadout,
      ...Object.values(bot.animations || {})
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
    ];

    let loaded = 0;
    for (const file of files) {
      const response = await fetch(file, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Could not preload ${file}`);
      }
      await response.blob();
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
