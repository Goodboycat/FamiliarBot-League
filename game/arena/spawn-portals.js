/**
 * SPAWN PORTALS — GLB-based team spawn portals (blue + red).
 *
 * Replaces the old procedural hex-pad spawn visuals (still kept as fallback
 * inside spawn-pads.js if the GLBs fail to load). The portals come from:
 *   • ./assets/spawn_portal_blue.glb  → player spawn @ TERRAIN.spawns.player.pos
 *   • ./assets/spawn_portal_red.glb   → enemy  spawn @ TERRAIN.spawns.enemy.pos
 *
 * Each portal is loaded asynchronously; until they finish loading we just
 * leave the procedural spawn pad visible so the player never sees an empty
 * patch of ground. When the GLB resolves, we hide the procedural mesh and
 * swap in the portal.
 *
 * Exports (globals):
 *   buildSpawnPortals(scene) -> { group, getSpawn(side), update(dt) }
 *
 * The returned API matches the legacy buildSpawnPads() so the game-scene
 * code can drop us in without changes.
 */
(function () {
  const PORTAL_FILES = {
    player: ['../../assets/spawn_portal_blue.glb', './assets/spawn_portal_blue.glb'],
    enemy:  ['../../assets/spawn_portal_red.glb',  './assets/spawn_portal_red.glb'],
  };

  // Native portal GLB extents (eyeball estimate — they're ~6 units wide).
  // We re-fit to the spawn-pad's configured radius after load so the visuals
  // always cover the spawn area regardless of source mesh size.
  const TARGET_RADIUS_MULT = 1.05;

  function resolveAssetUrl(rel) {
    const scriptEl =
      document.currentScript ||
      Array.from(document.scripts).find((s) => /spawn-portals\.js/.test(s.src));
    const base = scriptEl ? new URL(scriptEl.src, window.location.href) : window.location.href;
    return new URL(rel, base).href;
  }

  function getGLTFLoader() {
    if (window.GLTFLoader) return window.GLTFLoader;
    if (window.THREE && window.THREE.GLTFLoader) return window.THREE.GLTFLoader;
    return null;
  }

  async function fetchGLBBuffer(paths) {
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

  function buildSpawnPortals(scene) {
    const THREE = window.THREE;
    if (!THREE) {
      console.warn('[SpawnPortals] THREE not loaded.');
      return buildFallback(scene);
    }
    const T = window.TERRAIN;
    if (!T) {
      console.warn('[SpawnPortals] TERRAIN missing.');
      return buildFallback(scene);
    }

    // We still build the procedural pads so there is something to look at
    // while the GLB loads. They become invisible once the portal arrives.
    const fallback = (typeof window.buildSpawnPads === 'function')
      ? window.buildSpawnPads(scene, { silent: true })
      : null;

    const group = new THREE.Group();
    group.name = 'SpawnPortals';
    scene.add(group);

    const portals = {
      player: { root: null, mixer: null, light: null },
      enemy:  { root: null, mixer: null, light: null },
    };

    const sides = [
      { key: 'player', cfg: T.spawns.player, paths: PORTAL_FILES.player, color: T.palette.teamPlayer },
      { key: 'enemy',  cfg: T.spawns.enemy,  paths: PORTAL_FILES.enemy,  color: T.palette.teamEnemy  },
    ];

    sides.forEach(async (side) => {
      const Loader = getGLTFLoader();
      if (!Loader) {
        console.warn('[SpawnPortals] GLTFLoader unavailable — keeping procedural pads.');
        return;
      }
      const buffer = await fetchGLBBuffer(side.paths);
      if (!buffer) {
        console.warn(`[SpawnPortals] ${side.key} portal GLB not found — keeping procedural pad.`);
        return;
      }
      const loader = new Loader();
      loader.parse(buffer, '', (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        if (!root) return;

        // Fit portal to the configured spawn radius. Compute bbox to derive
        // current XZ extent, then scale uniformly so the portal width
        // matches cfg.radius * 2 * TARGET_RADIUS_MULT.
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const native = Math.max(size.x, size.z, 1e-3);
        const target = side.cfg.radius * 2 * TARGET_RADIUS_MULT;
        const s = target / native;
        root.scale.set(s, s, s);

        // Sit on the floor and center on the spawn position.
        const boxAfter = new THREE.Box3().setFromObject(root);
        root.position.set(
          side.cfg.pos[0] - (boxAfter.min.x + boxAfter.max.x) / 2,
          -boxAfter.min.y + 0.02,  // foot on ground, slight lift to avoid z-fight
          side.cfg.pos[1] - (boxAfter.min.z + boxAfter.max.z) / 2,
        );

        // Tag this object so other systems can find it.
        root.name = `Portal_${side.key}`;
        root.userData.side = side.key;

        // Per-portal point light to match the team color.
        const pl = new THREE.PointLight(side.color, 1.4, 24);
        pl.position.set(side.cfg.pos[0], 3.5, side.cfg.pos[1]);
        scene.add(pl);
        portals[side.key].light = pl;

        // Animations (rotation, glow, etc.) — play whatever the GLB ships.
        let mixer = null;
        if (gltf.animations && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(root);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        }

        // Best-effort emissive boost so the portal reads at distance.
        root.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m && m.emissive && m.emissiveIntensity != null) {
              m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.9);
            }
            if (m && m.transparent != null && m.opacity != null && m.opacity < 0.98) {
              m.depthWrite = false;
            }
          });
        });

        group.add(root);
        portals[side.key].root  = root;
        portals[side.key].mixer = mixer;

        // Hide the procedural fallback pad now that the portal is in.
        if (fallback && fallback.group) {
          fallback.group.traverse((o) => {
            // Only hide the matching side's pad; spawn pads are stored as
            // a flat list of pad groups tagged by userData.side.
            if (o.userData && o.userData.side === side.key) o.visible = false;
          });
        }

        console.log(`[SpawnPortals] ✓ ${side.key} portal loaded (scale ${s.toFixed(3)}).`);
      }, (err) => {
        console.warn(`[SpawnPortals] parse failed for ${side.key}:`, err && err.message);
      });
    });

    let bobT = 0;
    function update(dt) {
      bobT += dt;
      if (fallback && typeof fallback.update === 'function') fallback.update(dt);
      ['player', 'enemy'].forEach((k) => {
        const p = portals[k];
        if (p.mixer) p.mixer.update(dt);
        if (p.root)  p.root.rotation.y += dt * 0.25; // gentle spin
      });
    }

    function getSpawn(side) {
      // Defer to the procedural pad's spawn picker — it already randomizes
      // a point inside the spawn radius and lives in scene coordinates.
      if (fallback && typeof fallback.getSpawn === 'function') return fallback.getSpawn(side);
      const s = side === 'player' ? T.spawns.player : T.spawns.enemy;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (s.radius * 0.6);
      return new THREE.Vector3(s.pos[0] + Math.cos(a) * r, 0, s.pos[1] + Math.sin(a) * r);
    }

    return { group, update, getSpawn, portals };
  }

  function buildFallback(scene) {
    if (typeof window.buildSpawnPads === 'function') return window.buildSpawnPads(scene);
    return { group: null, update() {}, getSpawn() { return new (window.THREE || {}).Vector3(0,0,0); } };
  }

  window.buildSpawnPortals = buildSpawnPortals;
})();
