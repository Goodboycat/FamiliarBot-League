/**
 * FamiliarBot League — Performance patch module (sibling of game-screen.js).
 *
 * Three concerns, all aimed at fixing the perceived lag on mobile:
 *
 *  A) Battlefield 2× sizing.
 *     The user wants a MOBA-Pokémon-Unite-scale field, i.e. roughly twice
 *     the current footprint. We scale TERRAIN.fieldW / fieldD / corner-
 *     radius, every capturePoints / jungleClusters / sideBushes / walls
 *     / pillars / spawns / altar / perimeter coordinate, AND the spawn-pad
 *     mesh offsets used by buildSpawnPads. We also bump the camera follow
 *     height, fog density floor, and arena clamp limits used by the
 *     player input loop in game-scene.js so the player can roam the larger
 *     map.  Actor base speeds are scaled by the same factor so traversal
 *     time stays roughly the same — otherwise the field "feels" twice as
 *     slow on a phone.
 *
 *  B) Off-camera culling.
 *     Three.js auto-frustum-culls meshes by their bounding sphere, but our
 *     bot/wild/boss meshes are Groups whose bounding sphere is computed at
 *     the origin and never recomputed (so children stay visible from any
 *     angle once the group enters the frustum). We register a per-frame
 *     cull pass that hides:
 *       • bot groups (allies, enemies, player)
 *       • wild robot groups
 *       • boss groups
 *     when their world position is outside the camera frustum. The player
 *     mesh is ALWAYS visible. Pending VFX particles whose burst center is
 *     outside the frustum are skipped at spawn time too.
 *
 *  C) Fog-of-war vision rules (NEW 2026 patch).
 *     Ally bots reappear whenever they are inside the camera frustum.
 *     Enemy bots stay hidden EVEN when on-screen unless either:
 *       (a) the player is within PLAYER_VISION_R world units of the enemy
 *           (player acts as a pinpoint, range matches camera distance), or
 *       (b) at least one living ally bot within ALLY_VISION_R world units
 *           of the enemy is itself on-screen (allies pinpoint at screen-
 *           distance).
 *     Spotted enemies are flagged with `._spotted = true` so the minimap
 *     can mirror the same fog-of-war.
 *
 *  D) Back-face removal on bot meshes.
 *     Pokémon Unite skips drawing the half of each mech that the camera
 *     can't see (it saves a meaningful amount of fragment work on phones).
 *     We toggle `material.side = THREE.FrontSide` and `frustumCulled = true`
 *     on every bot mesh material once it spawns. We also walk the meshes
 *     that are already in the scene at activation time.
 *
 * Exposes (window):
 *   FamiliarBotGamePerformance.scaleTerrain(factor)
 *   FamiliarBotGamePerformance.attachToWorld(scene, camera, world, vfx)
 *   FamiliarBotGamePerformance.tick(dt)
 *
 * Idempotent — calling scaleTerrain twice is a no-op (it records the factor
 * it already applied).
 */
(function (global) {
  const NS = {};

  // -------- A) battlefield 2× sizing -----------------------------------
  function scaleTerrain(factor) {
    factor = factor || 2;
    const T = global.TERRAIN;
    if (!T) {
      console.warn('[Perf] TERRAIN not available — cannot scale battlefield.');
      return false;
    }
    if (T._fbScaleApplied) {
      // Already scaled (game-screen reloaded from cache). Just refresh
      // dependent clamps and bail.
      NS._arenaClampHX = T.fieldW / 2 - 2;
      NS._arenaClampHZ = T.fieldD / 2 - 2;
      NS._scale = T._fbScaleApplied;
      return true;
    }

    T.fieldW       = T.fieldW * factor;
    T.fieldD       = T.fieldD * factor;
    T.cornerRadius = T.cornerRadius * factor;
    T.goldRim      = (T.goldRim || 1.4) * factor;

    function scalePair(p) { p[0] *= factor; p[1] *= factor; }
    function scaleObjPos(o) {
      if (o && o.pos) scalePair(o.pos);
      if (o && o.radius != null) o.radius *= factor;
    }

    (T.capturePoints || []).forEach(scaleObjPos);
    (T.jungleClusters || []).forEach((j) => { scaleObjPos(j); });
    (T.sideBushes || []).forEach((j) => { scaleObjPos(j); });

    (T.walls || []).forEach((w) => {
      w[0] *= factor; w[1] *= factor; w[2] *= factor; w[3] *= factor;
    });

    (T.pillars || []).forEach((p) => { p[0] *= factor; p[1] *= factor; });

    if (T.spawns) {
      if (T.spawns.player) { scalePair(T.spawns.player.pos); T.spawns.player.radius *= factor; }
      if (T.spawns.enemy)  { scalePair(T.spawns.enemy.pos);  T.spawns.enemy.radius  *= factor; }
    }

    if (T.altar) {
      scalePair(T.altar.pos);
      T.altar.radius *= factor;
      T.altar.height *= factor;
    }

    if (T.perimeter) {
      T.perimeter.merlonW *= factor;
      T.perimeter.merlonH *= factor;
      T.perimeter.merlonT *= factor;
      T.perimeter.wallH   *= factor;
    }

    // Rebuild CAPTURE_POINTS shim (arena-config.js writes a top-level
    // CAPTURE_POINTS array; many gameplay systems read it back).
    if (global.CAPTURE_POINTS && Array.isArray(global.CAPTURE_POINTS)) {
      global.CAPTURE_POINTS.length = 0;
      T.capturePoints.forEach((cp) => {
        global.CAPTURE_POINTS.push({
          id: cp.id, side: cp.side, label: cp.label,
          position: cp.pos, owner: cp.side,
          captureRadius: cp.radius,
          captureTime: cp.tier === 'base' ? 5 : (cp.tier === 'middle' ? 4 : 3),
          isActive: true, tier: cp.tier
        });
      });
    }

    T._fbScaleApplied = factor;

    NS._arenaClampHX = T.fieldW / 2 - 2;
    NS._arenaClampHZ = T.fieldD / 2 - 2;
    NS._scale = factor;
    console.log(`[Perf] Battlefield scaled by ×${factor} → ${T.fieldW.toFixed(0)} × ${T.fieldD.toFixed(0)}`);
    return true;
  }

  /**
   * Scale actor base speeds so the larger field still feels responsive.
   * Called by attachToWorld() after the world's spawn phase.
   */
  function scaleActorSpeeds(world, factor) {
    if (!world || !factor) return;
    const list = []
      .concat([world.player].filter(Boolean))
      .concat(world.allyBots || [])
      .concat(world.enemyBots || [])
      .concat(world.wildRobots || [])
      .concat(world.bosses || [])
      .concat(world.megaBoss ? [world.megaBoss] : []);
    for (const a of list) {
      if (a.baseSpeed != null) a.baseSpeed *= factor;
      if (a.speed     != null) a.speed     *= factor;
    }
    // Spawn positions live in actor.spawn — already in scaled world space
    // because they were placed via TERRAIN.spawns / TERRAIN.capturePoints
    // AFTER scaleTerrain ran. Nothing to fix.
  }

  // -------- C) fog-of-war vision ranges --------------------------------
  // World units. ALLY_VISION_R ≈ a Pokémon-Unite "screen-radius" around
  // each ally; PLAYER_VISION_R is the camera-distance equivalent around
  // the player. Tweak together to widen/narrow team vision.
  const ALLY_VISION_R   = 16;
  const PLAYER_VISION_R = 24;

  // -------- B) off-camera frustum culling ------------------------------
  function attachToWorld(scene, camera, world, vfx) {
    if (!camera || !world) return;
    NS._camera = camera;
    NS._world  = world;
    NS._vfx    = vfx;
    NS._scene  = scene;
    const THREE = global.THREE;
    if (!THREE) return;

    NS._frustum = new THREE.Frustum();
    NS._projMat = new THREE.Matrix4();
    NS._tmpVec  = new THREE.Vector3();
    NS._tmpSph  = new THREE.Sphere(new THREE.Vector3(), 4); // generous radius

    // Convert actor base speeds for the bigger map.
    if (NS._scale && NS._scale !== 1) scaleActorSpeeds(world, NS._scale);

    // Back-face removal: set FrontSide on every mech mesh material.
    forEachActorMesh(world, (m) => applyBackfaceCulling(m));

    // Wrap vfx.burst so VFX spawned outside the frustum are dropped.
    if (vfx && typeof vfx.burst === 'function' && !vfx._fbCullWrapped) {
      const orig = vfx.burst.bind(vfx);
      vfx.burst = function (opts) {
        if (opts && opts.pos && NS._frustum && NS._tmpSph) {
          NS._tmpSph.center.copy(opts.pos);
          NS._tmpSph.radius = Math.max(2, (opts.range || 8) * 1.2 * (opts.scale || 1));
          if (!NS._frustum.intersectsSphere(NS._tmpSph)) {
            // Off-camera — drop entirely.
            return;
          }
        }
        return orig(opts);
      };
      vfx._fbCullWrapped = true;
    }
  }

  function applyBackfaceCulling(meshOrGroup) {
    const THREE = global.THREE;
    if (!THREE || !meshOrGroup) return;
    meshOrGroup.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          // Points / lines have no `side`; skip.
          if (m.isPointsMaterial || m.isLineBasicMaterial || m.isLineDashedMaterial) return;
          // Transparent rings / capture circles use DoubleSide on purpose
          // (so the disc reads from below the camera too). Keep them.
          if (m.transparent && m.side === THREE.DoubleSide) return;
          m.side = THREE.FrontSide;
          m.needsUpdate = true;
        });
        o.frustumCulled = true;
      }
    });
  }

  function forEachActorMesh(world, fn) {
    const all = []
      .concat([world.player].filter(Boolean))
      .concat(world.allyBots || [])
      .concat(world.enemyBots || [])
      .concat(world.wildRobots || [])
      .concat(world.bosses || [])
      .concat(world.megaBoss ? [world.megaBoss] : []);
    for (const a of all) if (a && a.mesh) fn(a.mesh, a);
  }

  /**
   * Per-frame visibility pass. Hides bot / wild / boss groups whose world
   * position is outside the camera frustum. The player mesh is force-on.
   *
   * Enemies additionally need a "spotter" — either the player within
   * PLAYER_VISION_R, or an on-screen ally within ALLY_VISION_R. Spotted
   * enemies are tagged `._spotted = true` so the minimap can match the
   * fog-of-war.
   */
  function tick(_dt) {
    const cam = NS._camera, world = NS._world;
    if (!cam || !world || !NS._frustum) return;
    NS._projMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    NS._frustum.setFromProjectionMatrix(NS._projMat);

    function inFrustum(a) {
      NS._tmpSph.center.set(a.x, 1.5, a.z);
      NS._tmpSph.radius = 3.5;
      return NS._frustum.intersectsSphere(NS._tmpSph);
    }
    function maybeHide(a, alwaysShow) {
      if (!a || !a.mesh) return;
      if (!a.alive) { a.mesh.visible = false; return; }
      if (alwaysShow) { a.mesh.visible = true; return; }
      a.mesh.visible = inFrustum(a);
    }

    if (world.player) maybeHide(world.player, true);
    (world.allyBots   || []).forEach((a) => maybeHide(a, false));

    // ----- fog-of-war: enemies need a spotter ------------------------
    const player = world.player;
    const visibleAllies = (world.allyBots || []).filter(
      (a) => a && a.alive && a.mesh && a.mesh.visible
    );
    const playerR2 = PLAYER_VISION_R * PLAYER_VISION_R;
    const allyR2   = ALLY_VISION_R   * ALLY_VISION_R;
    (world.enemyBots || []).forEach((e) => {
      if (!e || !e.mesh) return;
      if (!e.alive) { e.mesh.visible = false; e._spotted = false; return; }
      // First: is the enemy inside the camera frustum at all?
      if (!inFrustum(e)) { e.mesh.visible = false; e._spotted = false; return; }
      // Then: is anyone spotting them?
      let spotted = false;
      if (player && player.alive) {
        const dx = e.x - player.x, dz = e.z - player.z;
        if (dx * dx + dz * dz <= playerR2) spotted = true;
      }
      if (!spotted) {
        for (let i = 0; i < visibleAllies.length; i++) {
          const a = visibleAllies[i];
          const dx = e.x - a.x, dz = e.z - a.z;
          if (dx * dx + dz * dz <= allyR2) { spotted = true; break; }
        }
      }
      e._spotted = spotted;
      e.mesh.visible = spotted;
    });

    (world.wildRobots || []).forEach((a) => maybeHide(a, false));
    (world.bosses     || []).forEach((a) => maybeHide(a, false));
    if (world.megaBoss) {
      // The mega boss is huge — give it a bigger sphere so it doesn't
      // pop in/out around the edges of the screen.
      NS._tmpSph.center.set(world.megaBoss.x, 4, world.megaBoss.z);
      NS._tmpSph.radius = 14;
      if (world.megaBoss.mesh) {
        world.megaBoss.mesh.visible =
          world.megaBoss.alive && NS._frustum.intersectsSphere(NS._tmpSph);
      }
    }

    // Late-spawned actors won't have been seen by attachToWorld(), so
    // re-apply back-face culling on first appearance.
    forEachActorMesh(world, (m) => {
      if (!m.userData._fbBackfaceApplied) {
        applyBackfaceCulling(m);
        m.userData._fbBackfaceApplied = true;
      }
    });
  }

  // -------- exports -----------------------------------------------------
  NS.scaleTerrain   = scaleTerrain;
  NS.attachToWorld  = attachToWorld;
  NS.tick           = tick;
  // Useful for game-scene.js to read updated arena clamp values.
  Object.defineProperty(NS, 'arenaClamp', {
    get() {
      const T = global.TERRAIN || {};
      return {
        hx: (T.fieldW || 162) / 2 - 2,
        hz: (T.fieldD || 90)  / 2 - 2
      };
    }
  });

  global.FamiliarBotGamePerformance = NS;
})(typeof window !== 'undefined' ? window : globalThis);
