/**
 * TALL GRASS — Pokémon-Unite-style hide-bush system.
 *
 * Loads ./assets/tall_grass_square.glb and instances it across the jungle
 * cluster + side-bush positions defined in TERRAIN. The grass patches act
 * as bush volumes: a bot/player standing inside a patch is hidden from
 * enemies (Pokémon-Unite mechanic), unless they attack or take damage.
 *
 * Exposes (globals):
 *   buildTallGrass(scene) -> {
 *     group,                 // THREE.Group containing every grass patch
 *     patches: [...],        // [{ x, z, radius }]
 *     pointInGrass(x, z),    // -> patch | null
 *     update(dt)             // gentle sway animation
 *   }
 *   FamiliarBotTallGrass.pointInGrass(x, z)   (convenience accessor)
 *
 * Each grass square is uniformly scaled so its XZ footprint matches the
 * configured jungle cluster radius (~6.5 units for main clusters, ~3.5 for
 * side bushes). The native bbox is read once after parsing.
 */
(function () {
  const GRASS_PATHS = [
    '../../assets/tall_grass_square.glb',
    './assets/tall_grass_square.glb',
    '../assets/tall_grass_square.glb',
  ];

  function resolveAssetUrl(rel) {
    const scriptEl =
      document.currentScript ||
      Array.from(document.scripts).find((s) => /tall-grass\.js/.test(s.src));
    const base = scriptEl ? new URL(scriptEl.src, window.location.href) : window.location.href;
    return new URL(rel, base).href;
  }

  function getGLTFLoader() {
    if (window.GLTFLoader) return window.GLTFLoader;
    if (window.THREE && window.THREE.GLTFLoader) return window.THREE.GLTFLoader;
    return null;
  }

  async function fetchBuffer(paths) {
    for (const rel of paths) {
      const url = resolveAssetUrl(rel);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        return await res.arrayBuffer();
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // Patch spec — pulled from TERRAIN.jungleClusters + TERRAIN.sideBushes.
  // Tiers tag main vs. side so the AI can prefer the bigger patches.
  function collectPatchSpecs(T) {
    const out = [];
    (T.jungleClusters || []).forEach((c, i) => {
      out.push({ id: `jc_${i}`, x: c.pos[0], z: c.pos[1], radius: c.radius || 6.5, tier: 'main' });
    });
    (T.sideBushes || []).forEach((c, i) => {
      out.push({ id: `sb_${i}`, x: c.pos[0], z: c.pos[1], radius: c.radius || 3.5, tier: 'side' });
    });
    return out;
  }

  function buildTallGrass(scene) {
    const THREE = window.THREE;
    if (!THREE) {
      console.warn('[TallGrass] THREE not loaded.');
      return emptyHandle();
    }
    const T = window.TERRAIN;
    if (!T) {
      console.warn('[TallGrass] TERRAIN missing.');
      return emptyHandle();
    }

    const group = new THREE.Group();
    group.name = 'TallGrass';
    scene.add(group);

    const patches = collectPatchSpecs(T);

    // We expose patches immediately so the hide-mechanic logic in
    // game-world.js can already query pointInGrass(...) before the GLB
    // even finishes parsing. The visuals just lag a frame or two.
    const handle = {
      group,
      patches,
      pointInGrass,
      update,
      ready: false,
    };

    function pointInGrass(x, z) {
      // Returns the first patch containing (x, z), or null.
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz <= p.radius * p.radius) return p;
      }
      return null;
    }

    // Sway animation: walk grass meshes and modulate scale.y slightly.
    const swayTargets = [];
    let swayT = 0;
    function update(dt) {
      swayT += dt;
      for (let i = 0; i < swayTargets.length; i++) {
        const s = swayTargets[i];
        const phase = swayT * 1.6 + s.phaseOffset;
        s.mesh.scale.y = s.baseY * (1 + 0.04 * Math.sin(phase));
        // tiny tilt for organic feel
        s.mesh.rotation.x = Math.sin(phase * 0.6) * 0.02;
        s.mesh.rotation.z = Math.cos(phase * 0.7) * 0.02;
      }
    }

    // ---- async GLB load ----
    (async () => {
      const Loader = getGLTFLoader();
      if (!Loader) {
        console.warn('[TallGrass] GLTFLoader unavailable — grass will not render (mechanic still active).');
        return;
      }
      const buffer = await fetchBuffer(GRASS_PATHS);
      if (!buffer) {
        console.warn('[TallGrass] tall_grass_square.glb missing — grass will not render (mechanic still active).');
        return;
      }
      const loader = new Loader();
      loader.parse(buffer, '', (gltf) => {
        const proto = gltf.scene || gltf.scenes[0];
        if (!proto) {
          console.warn('[TallGrass] GLB has no scene.');
          return;
        }

        // Compute native bbox once.
        const box = new THREE.Box3().setFromObject(proto);
        const size = new THREE.Vector3();
        box.getSize(size);
        const native = Math.max(size.x, size.z, 1e-3);
        const nativeY = Math.max(size.y, 1e-3);

        patches.forEach((p, idx) => {
          // Clone the proto for each patch. Clone preserves materials &
          // textures by default in three.js.
          const inst = proto.clone(true);

          // Fit XZ footprint to 2*radius (the patch covers the full
          // hide-radius), keep height roughly proportional.
          const sXZ = (p.radius * 2) / native;
          const sY  = Math.min(sXZ * 1.4, 1.8);
          inst.scale.set(sXZ, sY, sXZ);

          // Sit on the ground; small lift to avoid z-fighting with floor.
          const ib = new THREE.Box3().setFromObject(inst);
          inst.position.set(
            p.x - (ib.min.x + ib.max.x) / 2,
            -ib.min.y + 0.05,
            p.z - (ib.min.z + ib.max.z) / 2,
          );
          inst.rotation.y = (idx * 0.37) % (Math.PI * 2);
          inst.name = `TallGrass_${p.id}`;
          inst.userData.patch = p;

          // Boost emissive a touch and force two-sided so blade meshes
          // don't disappear from one angle.
          inst.traverse((obj) => {
            if (!obj.isMesh || !obj.material) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (!m) return;
              if (m.side != null) m.side = THREE.DoubleSide;
              if (m.transparent) m.depthWrite = false;
              if (m.emissive && m.emissiveIntensity != null) {
                m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.35);
              }
            });
            // sway target uses the topmost mesh's scale
            swayTargets.push({
              mesh: obj,
              baseY: obj.scale.y,
              phaseOffset: idx * 0.7 + obj.position.x * 0.05,
            });
          });

          group.add(inst);
        });

        handle.ready = true;
        console.log(`[TallGrass] ✓ ${patches.length} grass patches loaded (native ${native.toFixed(2)}u, nativeY ${nativeY.toFixed(2)}u).`);
      }, (err) => {
        console.warn('[TallGrass] parse failed:', err && err.message);
      });
    })();

    window.FamiliarBotTallGrass = handle;
    return handle;
  }

  function emptyHandle() {
    return {
      group: null,
      patches: [],
      pointInGrass: () => null,
      update() {},
      ready: false,
    };
  }

  window.buildTallGrass = buildTallGrass;
})();
