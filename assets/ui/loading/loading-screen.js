(function () {
  const defaultConfigPath = "./loading_screen.json";

  function resolvePath(path, basePath) {
    return new URL(path, new URL(basePath, window.location.href)).href;
  }

  function toPercent(loaded, total) {
    if (!total) return 100;
    return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
  }

  async function fetchJson(path, options = {}) {
    if (window.FamiliarBotAssetCache) {
      return window.FamiliarBotAssetCache.fetchJson(path, options);
    }

    const response = await fetch(path);
    if (!response.ok) {
      if (options.optional) {
        console.warn(`[Loading] optional JSON missing: ${path}`);
        return null;
      }
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  // Only the lightweight top-level manifests are preloaded from the game
  // manifest. Per-bot binary assets (.fbx / .glb) and per-bot json sidecars
  // (power / weapon / loadout) are intentionally skipped at the loading
  // screen — they aren't ready yet and would either 404 or crash the game.
  // The runtime fallbacks in game-screen.js / garage-screen.js take over.
  function collectGameAssets(manifest) {
    return [
      manifest.loadingScreen?.config,
      manifest.loadingScreen?.background,
      manifest.roster,
      manifest.weaponCatalog,
      manifest.weaponSwapRules,
      manifest.powerCatalog
    ]
      .filter(Boolean)
      .map((asset) => typeof asset === "string" ? { path: asset } : asset);
  }

  // Files we never want to preload at the loading screen, regardless of
  // where in the manifest tree they came from. Bot models / animations are
  // not bundled yet and would crash the game on download — the fallbacks
  // (placeholder cube + CSS silhouette) cover us until they arrive.
  const SKIP_EXTENSIONS = [".fbx", ".glb", ".gltf"];

  function shouldSkipAsset(asset) {
    if (!asset || !asset.path) return true;
    const lower = String(asset.path).toLowerCase().split("?")[0];
    return SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  async function flattenAssets(config, configPath) {
    const assets = [config.background]
      .filter(Boolean)
      .map((path) => ({
        path: resolvePath(path, configPath)
      }));

    for (const group of config.assetGroups || []) {
      if (Array.isArray(group.paths)) {
        assets.push(...group.paths.map((path) => ({
          path: resolvePath(path, configPath)
        })));
      }

      if (group.manifest) {
        const manifestUrl = resolvePath(group.manifest, configPath);
        assets.push({ path: manifestUrl, optional: true });

        if (group.id === "game_manifest") {
          // Bot assets are still being built — try to read the game manifest,
          // but if it isn't bundled yet (or any sub-asset 404s during the
          // load loop below), we just skip them and the game falls back to
          // its built-in placeholder bots/arena.
          let gameManifest = null;
          try {
            gameManifest = await fetchJson(manifestUrl, { optional: true });
          } catch (err) {
            console.warn("[Loading] game manifest not available yet:", err.message);
          }
          if (gameManifest) {
            assets.push(...collectGameAssets(gameManifest).map((asset) => ({
              ...asset,
              path: resolvePath(asset.path, manifestUrl),
              optional: true
            })));
          }
        }
      }
    }

    const deduped = [...new Map(assets.map((asset) => [asset.key || asset.path, asset])).values()];
    const filtered = deduped.filter((asset) => !shouldSkipAsset(asset));
    const skipped = deduped.length - filtered.length;
    if (skipped > 0) {
      console.info(`[Loading] skipping ${skipped} bot model/animation file(s) (.fbx/.glb) — not bundled yet, runtime fallback will be used.`);
    }
    return filtered;
  }

  async function preloadAsset(asset) {
    // Treat every asset as optional while bot assets are still WIP. A 404
    // on a single bot model / animation / music track shouldn't block the
    // loading screen from completing.
    try {
      if (window.FamiliarBotAssetCache) {
        return await window.FamiliarBotAssetCache.fetchAsset(asset.path, {
          key: asset.key,
          optional: true
        });
      }

      const response = await fetch(asset.path, { cache: "force-cache" });
      if (!response.ok) {
        console.warn(`[Loading] skipping missing asset (${response.status}): ${asset.path}`);
        return null;
      }
      return await response.blob();
    } catch (err) {
      console.warn(`[Loading] skipping asset ${asset.path}: ${err.message}`);
      return null;
    }
  }

  function createLoadingScreen(config) {
    const root = document.createElement("section");
    root.className = "loading-screen";
    root.innerHTML = `
      <div class="loading-panel" role="status" aria-live="polite">
        <h1 class="loading-title"></h1>
        <p class="loading-subtitle"></p>
        <div class="loading-progress" aria-hidden="true">
          <div class="loading-progress-fill"></div>
        </div>
        <div class="loading-meta">
          <span class="loading-step">Starting</span>
          <span class="loading-percent">0%</span>
        </div>
      </div>
    `;

    root.querySelector(".loading-title").textContent = config.title || "Loading";
    root.querySelector(".loading-subtitle").textContent = config.subtitle || "Preparing assets";
    document.body.appendChild(root);
    return root;
  }

  async function start(options = {}) {
    const startedAt = performance.now();
    const configPath = options.configPath || defaultConfigPath;
    const config = options.config || await fetchJson(configPath);

    // Switch background music to the loading track. The audio manager
    // queues this until the first user gesture if autoplay is blocked.
    if (window.FamiliarBotAudio) {
      window.FamiliarBotAudio.play("loading");
    }
    const root = options.root || createLoadingScreen(config);
    const fill = root.querySelector(".loading-progress-fill");
    const step = root.querySelector(".loading-step");
    const percent = root.querySelector(".loading-percent");
    const assets = options.assets || await flattenAssets(config, configPath);

    let loaded = 0;
    const update = (label) => {
      const value = toPercent(loaded, assets.length);
      fill.style.width = `${value}%`;
      step.textContent = label || "Loading assets";
      percent.textContent = `${value}%`;
    };

    update("Loading background");

    for (const asset of assets) {
      const result = await preloadAsset(asset);
      loaded += 1;
      const name = asset.path.split("/").pop();
      if (!result) {
        update(`Skipped ${name}`);
      } else {
        update(`${result.fromCache ? "Cached" : "Loaded"} ${name}`);
      }
    }

    const minimumMs = (config.minimumDisplaySeconds || 0) * 1000;
    const elapsed = performance.now() - startedAt;
    if (elapsed < minimumMs) {
      await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
    }

    update("Ready");

    // Tear down the loading screen so the next screen (menu) is visible.
    // The loading-screen <section> is fixed + z-index:10 — leaving it in
    // the DOM (which the original implementation did) just covers the
    // menu, so the user sees a 100%-full bar while menu music plays.
    function dismiss() {
      if (!root || !root.parentNode) return;
      root.classList.add("loading-screen--dismissed");
      // Fade out, then remove. CSS transition is ~280ms; remove after 320ms.
      setTimeout(() => {
        if (root.parentNode) {
          root.parentNode.removeChild(root);
        }
      }, 320);
    }

    dismiss();

    if (typeof options.onReady === "function") {
      options.onReady(root);
    }

    return root;
  }

  window.FamiliarBotLoadingScreen = { start };
})();
