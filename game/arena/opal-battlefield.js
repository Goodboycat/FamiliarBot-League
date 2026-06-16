/**
 * OPAL BATTLEFIELD — GLB-based arena replacement.
 *
 * Loads ./assets/opal_battlefield.glb and inserts it into the scene at the
 * origin, scaled to match TERRAIN.fieldW × TERRAIN.fieldD so gameplay logic
 * (capture points, spawn pads, walls/pillars/altar collisions) keeps working
 * against the same coordinate space as before.
 *
 * Native GLB bounds  : X[-100..100], Z[-50..50]  (200 × 100)
 * Target arena bounds: X[-fieldW/2..fieldW/2], Z[-fieldD/2..fieldD/2] (162 × 90 by default)
 *
 * The GLB itself contains the floor, perimeter walls, glowing gems, grass,
 * spawn rings (blue/red) and 10 capture-point rings — so the matching
 * procedural modules (floor, perimeter-wall, glow-pools, jungle-bushes,
 * walls, pillars, altar) are skipped when this module is active.
 *
 * Exports (globals):
 *   buildOpalBattlefield(scene, onReady) -> { group, ready, update(dt) }
 *
 * The function returns synchronously with a placeholder group while the GLB
 * is fetched asynchronously. Once parsed, the GLB scene is added to the
 * group and `onReady(info)` is invoked. The arena is fully usable during
 * the load window — capture points, spawn pads, and collisions all key off
 * TERRAIN directly, not the mesh.
 */

(function () {
  // Resolved relative to opal-battlefield.js (i.e. ./game/arena/opal-battlefield.js).
  // The GLB ships at ./assets/opal_battlefield.glb from the project root, so the
  // canonical path here is two levels up. We also try a few fallbacks in case the
  // file is hosted next to the script (e.g. embedded build).
  const GLB_PATHS = [
    '../../assets/opal_battlefield.glb',
    './assets/opal_battlefield.glb',
    './opal_battlefield.glb',
    '../assets/opal_battlefield.glb',
  ];

  // Native GLB extents (from accessor min/max in the source file)
  const NATIVE_W = 200; // X extent
  const NATIVE_D = 100; // Z extent

  function resolveAssetUrl(rel) {
    // Resolve relative to whichever script tag loaded this file so that the
    // game still works when index.html is served from any directory depth.
    const scriptEl =
      document.currentScript ||
      Array.from(document.scripts).find((s) => /opal-battlefield\.js/.test(s.src));
    const base = scriptEl ? new URL(scriptEl.src, window.location.href) : window.location.href;
    return new URL(rel, base).href;
  }

  function getGLTFLoader() {
    if (window.GLTFLoader) return window.GLTFLoader;
    if (window.THREE && window.THREE.GLTFLoader) return window.THREE.GLTFLoader;
    return null;
  }

  function loadScript(src) {
    return new Promise((done, fail) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        if (existing.dataset.loaded === 'true') return done();
        existing.addEventListener('load', () => done());
        existing.addEventListener('error', () => fail(new Error('Failed: ' + src)));
        return;
      }
      const tag = document.createElement('script');
      tag.src = src;
      tag.async = false;
      tag.addEventListener('load', () => { tag.dataset.loaded = 'true'; done(); });
      tag.addEventListener('error', () => fail(new Error('Failed: ' + src)));
      document.head.appendChild(tag);
    });
  }

  async function ensureGLTFLoader() {
    if (getGLTFLoader()) return getGLTFLoader();
    // r128 ships GLTFLoader as an add-on under examples/js. We try a couple of
    // CDNs in case one is blocked offline.
    const urls = [
      'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    ];
    for (const url of urls) {
      try {
        await loadScript(url);
        if (getGLTFLoader()) return getGLTFLoader();
      } catch (err) {
        console.warn('[OpalBattlefield] GLTFLoader CDN load failed:', url, err.message);
      }
    }
    return getGLTFLoader();
  }

  async function fetchGLB() {
    // Prefer the cached/IndexedDB-backed path if FamiliarBotGLBLoader is set up.
    for (const rel of GLB_PATHS) {
      const url = resolveAssetUrl(rel);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        return await res.arrayBuffer();
      } catch (err) {
        // try next
      }
    }
    return null;
  }

  function buildOpalBattlefield(scene, onReady) {
    const THREE = window.THREE;
    if (!THREE) {
      console.warn('[OpalBattlefield] THREE not loaded — cannot build arena.');
      return { group: null, ready: false, update() {} };
    }

    const T = window.TERRAIN || { fieldW: 200, fieldD: 100, palette: { void: 0x07101c } };

    const group = new THREE.Group();
    group.name = 'OpalBattlefield';
    scene.add(group);

    // Lights — single hemi + single directional sun, matching the legacy
    // mobile-safe lighting budget. Slightly warmer to flatter the baked
    // ground texture in the GLB.
    const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1326, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1c2, 0.9);
    sun.position.set(40, 90, 30);
    scene.add(sun);

    scene.background = new THREE.Color(T.palette ? T.palette.void : 0x07101c);
    if (scene.fog) {
      scene.fog.color = new THREE.Color(0x07101c);
      if ('density' in scene.fog) scene.fog.density = 0.006;
    }

    let ready = false;
    let mixer = null;

    (async () => {
      const LoaderClass = await ensureGLTFLoader();
      if (!LoaderClass) {
        console.warn('[OpalBattlefield] GLTFLoader unavailable — battlefield will not render.');
        return;
      }
      const buffer = await fetchGLB();
      if (!buffer) {
        console.warn('[OpalBattlefield] opal_battlefield.glb not found — battlefield will not render.');
        return;
      }
      const loader = new LoaderClass();
      // The GLB uses EXT_mesh_gpu_instancing (Khronos) for walls/gems/grass.
      // r128's stock GLTFLoader doesn't ship support for it, so we register
      // a small plugin that hydrates those nodes into InstancedMeshes.
      if (typeof loader.register === 'function') {
        loader.register((parser) => new GPUInstancingExtension(parser));
      }
      loader.parse(buffer, '', (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        if (!root) {
          console.warn('[OpalBattlefield] GLB has no scene.');
          return;
        }

        // --- Scale GLB native (200 × 100) → arena (TERRAIN.fieldW × fieldD).
        // We use the smaller scale so the battlefield never spills outside
        // the gameplay footprint. Y is scaled the same as X for natural look.
        const sx = T.fieldW / NATIVE_W;
        const sz = T.fieldD / NATIVE_D;
        const s = Math.min(sx, sz);
        root.scale.set(sx, s, sz);

        // Center on origin (the GLB is already centered, but enforce it).
        root.position.set(0, 0, 0);

        // Best-effort tweaks: make sure materials don't write to depth from
        // the glow rings, and keep emissive intensities sane on mobile.
        // Static battlefield meshes (floor, perimeter walls, gems, grass
        // decals, capture rings, spawn rings…) are scaled non-uniformly and
        // some of them are large flat planes whose three.js auto-computed
        // bounding sphere ends up under-sized after the scale/parent baking.
        // That auto frustum cull was the root cause of meshes popping in &
        // out as the camera moved across the field — three.js was hiding
        // entire chunks of the arena whenever their (wrong) bounding sphere
        // fell outside the frustum.
        //
        // FIX: turn frustum culling OFF on the static battlefield, and
        // re-expand each mesh's bounding sphere from the geometry so the
        // (rare) external culler still does the right thing. Static count
        // here is small (≈20 unique meshes incl. instanced groups) so the
        // perf hit is negligible.
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.frustumCulled = false;
            if (obj.geometry) {
              try {
                obj.geometry.computeBoundingBox();
                obj.geometry.computeBoundingSphere();
              } catch (_e) { /* non-fatal */ }
            }
            if (obj.material) {
              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              mats.forEach((m) => {
                if (m && m.emissiveIntensity != null) {
                  m.emissiveIntensity = Math.min(m.emissiveIntensity, 1.6);
                }
              });
            }
          }
        });
        // Also force the root group not to be culled. This is belt-and-
        // braces: three.js culls Groups too when their first child has a
        // dirty sphere.
        root.frustumCulled = false;
        group.frustumCulled = false;

        group.add(root);

        if (gltf.animations && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(root);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        }

        ready = true;
        const tris = countTriangles(root);
        console.log(`[OpalBattlefield] ✓ loaded — ${tris} tris, scale=(${sx.toFixed(3)},${s.toFixed(3)},${sz.toFixed(3)})`);
        if (typeof onReady === 'function') onReady({ root, tris });
      }, (err) => {
        console.warn('[OpalBattlefield] GLB parse failed:', err && err.message);
      });
    })();

    function update(dt) {
      if (mixer) mixer.update(dt);
    }

    const handle = { group, update, get ready() { return ready; } };
    window._opalBattlefield = handle;
    return handle;
  }

  // ---- EXT_mesh_gpu_instancing extension plugin -----------------------
  // Minimal implementation for three.js r128 GLTFLoader. For each node that
  // carries the extension, we read TRANSLATION / ROTATION / SCALE per-instance
  // and synthesize an InstancedMesh from the node's referenced gltf mesh.
  // Per-instance vertex color (`_COLOR_0`) is folded in as an instanced
  // attribute and the material is patched to multiply emissive by it, so the
  // multi-colored gems & wall accents still look correct.
  class GPUInstancingExtension {
    constructor(parser) {
      this.parser = parser;
      this.name = 'EXT_mesh_gpu_instancing';
    }

    createNodeMesh(nodeIndex) {
      const parser = this.parser;
      const json = parser.json;
      const nodeDef = json.nodes[nodeIndex];
      if (!nodeDef.extensions || !nodeDef.extensions[this.name]) return null;
      if (nodeDef.mesh === undefined) return null;


      const ext = nodeDef.extensions[this.name];
      const attrs = ext.attributes || {};
      const promises = [];
      promises.push(parser.getDependency('mesh', nodeDef.mesh));
      const attrKeys = ['TRANSLATION', 'ROTATION', 'SCALE', '_COLOR_0'];
      attrKeys.forEach((k) => {
        if (attrs[k] !== undefined) {
          promises.push(parser.getDependency('accessor', attrs[k]));
        } else {
          promises.push(Promise.resolve(null));
        }
      });

      return Promise.all(promises).then(([meshDep, transAttr, rotAttr, scaleAttr, colAttr]) => {
        // Determine instance count from whichever accessor is present.
        const count = (transAttr && transAttr.count) ||
                      (rotAttr && rotAttr.count) ||
                      (scaleAttr && scaleAttr.count) || 1;

        // The mesh dependency is either a single Mesh (single-primitive case)
        // or a Group of Meshes (multi-primitive case). Normalize to a list of
        // primitive Meshes, then rebuild each one as an InstancedMesh.
        let primitives;
        if (meshDep && meshDep.isMesh) {
          primitives = [meshDep];
        } else if (meshDep && meshDep.isGroup) {
          primitives = meshDep.children.filter((c) => c.isMesh);
        } else {
          primitives = [];
        }

        const out = new THREE.Group();
        const tmpPos = new THREE.Vector3();
        const tmpQuat = new THREE.Quaternion();
        const tmpScl = new THREE.Vector3();
        const tmpMat = new THREE.Matrix4();

        primitives.forEach((child) => {
          if (!child.isMesh) {
            out.add(child.clone());
            return;
          }
          const im = new THREE.InstancedMesh(child.geometry, child.material, count);
          im.name = child.name + '_inst';
          for (let i = 0; i < count; i++) {
            tmpPos.set(0, 0, 0);
            tmpQuat.set(0, 0, 0, 1);
            tmpScl.set(1, 1, 1);
            if (transAttr) tmpPos.set(transAttr.getX(i), transAttr.getY(i), transAttr.getZ(i));
            if (rotAttr)   tmpQuat.set(rotAttr.getX(i),  rotAttr.getY(i),  rotAttr.getZ(i),  rotAttr.getW(i));
            if (scaleAttr) tmpScl.set(scaleAttr.getX(i), scaleAttr.getY(i), scaleAttr.getZ(i));
            tmpMat.compose(tmpPos, tmpQuat, tmpScl);
            im.setMatrixAt(i, tmpMat);
          }
          im.instanceMatrix.needsUpdate = true;

          if (colAttr && im.setColorAt) {
            const c = new THREE.Color();
            for (let i = 0; i < count; i++) {
              c.setRGB(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i));
              im.setColorAt(i, c);
            }
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
          }
          out.add(im);
        });
        return out;
      }).catch((err) => {
        console.warn('[OpalBattlefield]   instanced node hydration failed for', nodeIndex, err);
        return null;
      });
    }
  }

  function countTriangles(root) {
    let tris = 0;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      const idx = g.getIndex();
      const pos = g.getAttribute('position');
      if (!pos) return;
      const tc = idx ? idx.count / 3 : pos.count / 3;
      tris += Math.round(o.isInstancedMesh ? tc * o.count : tc);
    });
    return tris;
  }

  // Generic AABB-based perimeter clamp using the GLB footprint (matches the
  // procedural arena's rounded-rect clamp closely enough for movement code).
  function clampToOpalArena(pos) {
    const T = window.TERRAIN;
    if (!T) return;
    const hw = T.fieldW / 2 - 2;
    const hd = T.fieldD / 2 - 2;
    pos.x = Math.max(-hw, Math.min(hw, pos.x));
    pos.z = Math.max(-hd, Math.min(hd, pos.z));
  }

  window.buildOpalBattlefield = buildOpalBattlefield;
  window.clampToOpalArena = clampToOpalArena;
})();
