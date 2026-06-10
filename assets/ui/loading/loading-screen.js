(function () {
  const defaultConfigPath = "./loading_screen.json";

  function resolvePath(path, basePath) {
    return new URL(path, new URL(basePath, window.location.href)).href;
  }

  function toPercent(loaded, total) {
    if (!total) return 100;
    return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  async function flattenAssets(config, configPath) {
    const assets = [config.background].filter(Boolean).map((path) => resolvePath(path, configPath));

    for (const group of config.assetGroups || []) {
      if (Array.isArray(group.paths)) {
        assets.push(...group.paths.map((path) => resolvePath(path, configPath)));
      }

      if (group.manifest) {
        assets.push(resolvePath(group.manifest, configPath));
      }
    }

    return assets;
  }

  async function preloadAsset(path) {
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Could not preload ${path}`);
    }
    return response.blob();
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
      await preloadAsset(asset);
      loaded += 1;
      update(`Loaded ${asset.split("/").pop()}`);
    }

    const minimumMs = (config.minimumDisplaySeconds || 0) * 1000;
    const elapsed = performance.now() - startedAt;
    if (elapsed < minimumMs) {
      await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
    }

    update("Ready");

    if (typeof options.onReady === "function") {
      options.onReady(root);
    }

    return root;
  }

  window.FamiliarBotLoadingScreen = { start };
})();
