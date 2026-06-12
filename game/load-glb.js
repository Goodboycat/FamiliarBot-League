(function () {
  function defaultKeyFromUrl(url) {
    const path = new URL(url, window.location.href).pathname;
    return `glb:${path}`;
  }

  async function getBufferFromCache(url, key) {
    if (!window.FamiliarBotAssetCache) {
      let response;
      try {
        response = await fetch(url);
      } catch (err) {
        console.warn(`[GLB] network error for ${url}: ${err.message}`);
        return null;
      }

      if (!response.ok) {
        console.warn(`[GLB] missing model (${response.status}): ${url}`);
        return null;
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
    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      console.warn(`[GLB] network error for ${url}: ${err.message}`);
      return null;
    }

    if (!response.ok) {
      // Bot model not bundled yet — caller will use placeholder mesh.
      console.warn(`[GLB] missing model (${response.status}): ${url}`);
      return null;
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
    const result = await getBufferFromCache(url, key);
    if (!result) {
      // No buffer — caller is responsible for using a placeholder mesh.
      return {
        gltf: null,
        buffer: null,
        fromCache: false,
        key: key || defaultKeyFromUrl(url),
        missing: true
      };
    }
    const { buffer, fromCache } = result;
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
