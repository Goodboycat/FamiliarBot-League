/**
 * FamiliarBot League — Visuals patch module (sibling of game-screen.js).
 *
 * Loaded lazily by game-screen.js. Hooks into the THREE.js scene right after
 * `startMobaThreeScene()` builds the renderer + scene, and:
 *
 *   1. Disables shadow mapping entirely (no shadow casters, no shadow rcvrs).
 *   2. Replaces the dim hemi/sun lights with a bright, flat lighting rig so
 *      the field reads clearly on mobile under any ambient light.
 *   3. Boosts every material's brightness — increases emissiveIntensity, sets
 *      a minimum baseline emissive on dark materials, and adds a global tone-
 *      mapping exposure bump on the renderer.
 *   4. Optionally applies a *safe* toon (cel) shader pass via Three's built-in
 *      MeshToonMaterial. Crucially we keep:
 *        • the original `map`  (color/diffuse texture)
 *        • the original `emissive` + `emissiveIntensity` + `emissiveMap`
 *        • the original `transparent` / `opacity` flags
 *        • the original `vertexColors` flag (so instanced gem colors survive)
 *      Materials that are MeshBasicMaterial (HUD-ish rings, beams, fills) or
 *      Points / Line / Sprite are LEFT UNTOUCHED so VFX & capture rings still
 *      read correctly.
 *      If a material has no map and uses vertexColors only (instanced gem
 *      colors), we also leave it as-is — converting it can wash out the gem
 *      palette baked into the GLB.
 *
 * Exposes (window):
 *   FamiliarBotGameVisuals.applyToScene(scene, renderer, opts)
 *   FamiliarBotGameVisuals.applyToon(scene, opts)
 *
 * `opts.toon` is false by default. The caller passes `{ toon: true }` once
 * the GLB has finished loading so we can decide per-material whether the
 * conversion is safe.
 */
(function (global) {
  const NS = {};

  // ---------- helpers ---------------------------------------------------
  function isReplaceableForToon(mat) {
    if (!mat) return false;
    // Only standard / phong / lambert materials carry per-light shading
    // that the toon shader can plausibly emulate. Basic / line / points /
    // sprite / shader / raw shader materials must be preserved.
    const ok =
      mat.isMeshStandardMaterial  ||
      mat.isMeshPhongMaterial     ||
      mat.isMeshLambertMaterial   ||
      mat.isMeshPhysicalMaterial;
    if (!ok) return false;
    // Skip materials whose only shading is vertexColors with no texture —
    // converting often crushes the baked-in gem palette.
    if (mat.vertexColors && !mat.map) return false;
    // Skip transparent materials (cel-shading transparency is unreliable).
    if (mat.transparent && (mat.opacity == null || mat.opacity < 0.95)) return false;
    return true;
  }

  function ensureToonGradient(THREE) {
    if (NS._toonGradientTex) return NS._toonGradientTex;
    // Build a 4-step gradient (dark → mid → light → highlight). This is
    // what gives MeshToonMaterial its cel-shaded look on r128.
    const data = new Uint8Array([60, 60, 60, 130, 130, 130, 200, 200, 200, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBFormat || THREE.RGBAFormat);
    // Some r128 builds removed RGBFormat; fall back to luminance-pumped RGBA.
    if (!THREE.RGBFormat) {
      const rgba = new Uint8Array(4 * 4);
      for (let i = 0; i < 4; i++) {
        const v = data[i * 3];
        rgba[i * 4 + 0] = v; rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
      }
      tex.image = { data: rgba, width: 4, height: 1 };
      tex.format = THREE.RGBAFormat;
    }
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    NS._toonGradientTex = tex;
    return tex;
  }

  function brightenMaterial(mat) {
    if (!mat) return;
    // Boost baseline emissive on dark materials so shadowed/under-lit areas
    // never go pitch black. Only Standard/Phong/Lambert/Physical/Toon expose
    // .emissive.
    if (mat.emissive && typeof mat.emissive.getHex === 'function') {
      const hex = mat.emissive.getHex();
      if (hex === 0x000000) mat.emissive.setHex(0x1a2030);
      if (mat.emissiveIntensity != null) {
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.35);
      }
    }
    // Bring metalness down and roughness up slightly so the rig's flat light
    // doesn't read as plasticky shiny — but only on standard/physical.
    if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
      if (mat.metalness != null) mat.metalness = Math.min(mat.metalness, 0.35);
      if (mat.roughness != null) mat.roughness = Math.max(mat.roughness, 0.55);
    }
    mat.needsUpdate = true;
  }

  // ---------- main public APIs ------------------------------------------
  function applyToScene(scene, renderer, opts) {
    opts = opts || {};
    const THREE = global.THREE;
    if (!THREE || !scene) return;

    // 1) Strip any shadow setup. The mobile budget never enabled them, but
    //    third-party GLBs sometimes turn .castShadow on per-mesh.
    if (renderer) {
      renderer.shadowMap.enabled = false;
      // ToneMapping + exposure bump for a noticeably brighter image.
      if (THREE.ACESFilmicToneMapping != null) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
      renderer.toneMappingExposure = 1.45;
      if ('outputEncoding' in renderer && THREE.sRGBEncoding != null) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
    }

    // 2) Walk the scene: kill shadow flags + brighten materials.
    scene.traverse((o) => {
      if (o.castShadow) o.castShadow = false;
      if (o.receiveShadow) o.receiveShadow = false;
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(brightenMaterial);
      }
      if (o.isDirectionalLight || o.isSpotLight || o.isPointLight) {
        o.castShadow = false;
      }
    });

    // 3) Top up ambient illumination so nothing reads as a black silhouette.
    //    We add new lights instead of replacing existing ones — the GLB
    //    arena module installs its own hemi+sun and we don't want to fight
    //    it. Keep these tagged so we don't double-add on hot reload.
    if (!scene.getObjectByName('FB_FILL_AMBIENT')) {
      const amb = new THREE.AmbientLight(0xffffff, 0.85);
      amb.name = 'FB_FILL_AMBIENT';
      scene.add(amb);
    }
    if (!scene.getObjectByName('FB_FILL_HEMI')) {
      const hemi = new THREE.HemisphereLight(0xffffff, 0xb0bcd0, 0.6);
      hemi.name = 'FB_FILL_HEMI';
      hemi.position.set(0, 80, 0);
      scene.add(hemi);
    }
    if (!scene.getObjectByName('FB_FILL_KEY')) {
      const key = new THREE.DirectionalLight(0xfff4d8, 0.55);
      key.name = 'FB_FILL_KEY';
      key.position.set(40, 80, 40);
      key.castShadow = false;
      scene.add(key);
    }
    if (!scene.getObjectByName('FB_FILL_BACK')) {
      const back = new THREE.DirectionalLight(0xc4d8ff, 0.35);
      back.name = 'FB_FILL_BACK';
      back.position.set(-40, 60, -40);
      back.castShadow = false;
      scene.add(back);
    }

    // 4) Lighten the background a touch so the field doesn't disappear into
    //    the void after we increased exposure.
    if (scene.background && scene.background.isColor) {
      scene.background.setHex(0x16213a);
    }
    // 5) Soften fog so visibility doesn't fight the new exposure.
    if (scene.fog) {
      if ('density' in scene.fog) scene.fog.density = 0.0035;
      if (scene.fog.color && scene.fog.color.setHex) scene.fog.color.setHex(0x1a2438);
    }
  }

  /**
   * Apply a SAFE toon shader pass to the scene. Only converts standard /
   * phong / lambert / physical materials that have a diffuse map (so the
   * texture is preserved). Leaves VFX (points/line/basic), capture rings,
   * gems-with-vertex-color, and any transparent material untouched.
   */
  function applyToon(scene, opts) {
    opts = opts || {};
    const THREE = global.THREE;
    if (!THREE || !scene) return;
    if (!THREE.MeshToonMaterial) {
      console.warn('[Visuals] MeshToonMaterial not available in this build of three.js.');
      return;
    }
    const gradient = ensureToonGradient(THREE);
    let converted = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      const out = arr.map((m) => {
        if (!isReplaceableForToon(m)) return m;
        if (m.userData && m.userData._fbToonApplied) return m;
        const toon = new THREE.MeshToonMaterial({
          color:             m.color ? m.color.clone() : new THREE.Color(0xffffff),
          map:               m.map               || null,
          emissive:          m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
          emissiveMap:       m.emissiveMap       || null,
          emissiveIntensity: m.emissiveIntensity != null ? m.emissiveIntensity : 1,
          gradientMap:       gradient,
          transparent:       !!m.transparent,
          opacity:           m.opacity != null ? m.opacity : 1,
          side:              m.side != null ? m.side : THREE.FrontSide,
          alphaTest:         m.alphaTest != null ? m.alphaTest : 0,
          vertexColors:      !!m.vertexColors
        });
        toon.userData = Object.assign({}, m.userData || {}, { _fbToonApplied: true, _fbOriginal: m });
        toon.needsUpdate = true;
        converted++;
        return toon;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    if (opts.verbose !== false) {
      console.log(`[Visuals] Toon shader applied to ${converted} material${converted === 1 ? '' : 's'}.`);
    }
  }

  NS.applyToScene = applyToScene;
  NS.applyToon    = applyToon;
  global.FamiliarBotGameVisuals = NS;
})(typeof window !== 'undefined' ? window : globalThis);
