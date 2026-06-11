(function () {
  function defaultKeyFromUrl(url) {
    const path = new URL(url, window.location.href).pathname;
    return `glb:${path}`;
  }

  async function getBufferFromCache(url, key) {
    if (!window.FamiliarBotAssetCache) {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Could not download ${url}`);
      }

      return {
        buffer: await response.arrayBuffer(),
        fromCache: false
      };
    }

    const cacheKey = key || defaultKeyFromUrl(url);
    const cached = await window.FamiliarBotAssetCache.getAsset(cacheKey);

    if (cached) {
      console.log(`${cacheKey} loaded from cache`);
      return {
        buffer: await cached.blob.arrayBuffer(),
        fromCache: true
      };
    }

    console.log(`Downloading ${cacheKey}...`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Could not download ${url}`);
    }

    const buffer = await response.arrayBuffer();

    await window.FamiliarBotAssetCache.saveAsset(cacheKey, buffer, {
      contentType: "model/gltf-binary"
    });

    console.log(`${cacheKey} cached for next time`);

    return {
      buffer,
      fromCache: false
    };
  }

  function parseGLB(buffer, options = {}) {
    const LoaderClass = options.LoaderClass || window.GLTFLoader || window.THREE?.GLTFLoader;

    if (!LoaderClass) {
      return Promise.resolve({
        buffer,
        parsed: false,
        reason: "GLTFLoader is not available."
      });
    }

    return new Promise((resolve, reject) => {
      const loader = new LoaderClass(options.manager);
      loader.parse(buffer, options.resourcePath || "", resolve, reject);
    });
  }

  async function loadGLB(url, key, options = {}) {
    const { buffer, fromCache } = await getBufferFromCache(url, key);
    const gltf = await parseGLB(buffer, options);

    return {
      gltf,
      buffer,
      fromCache,
      key: key || defaultKeyFromUrl(url)
    };
  }

  window.FamiliarBotGLBLoader = {
    loadGLB
  };
})();
