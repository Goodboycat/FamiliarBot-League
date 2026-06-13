/**
 * TERRAIN INDEX — Orchestrates the "Restival" 5v5 MOBA arena.
 *
 * As of the Opal Battlefield update, the visual base of the arena is loaded
 * from `assets/opal_battlefield.glb` instead of being assembled from the
 * legacy procedural modules (floor, perimeter-wall, glow-pools, jungle-bushes,
 * walls, pillars, altar). Those modules still ship in the project so they
 * can be re-enabled per-scene if the GLB fails to load — see USE_OPAL_GLB.
 *
 * Gameplay overlays kept on top of the GLB:
 *   • Capture point indicators (5 per side) — drive capture progress visuals
 *   • Spawn pads (player/enemy) — animated team-colored hex pads
 *
 * Collision still keys off TERRAIN coordinates (walls, pillars, altar,
 * capture-point bases), so movement code continues to work unchanged.
 *
 * Call buildTerrain(scene) after the Three.js scene + lights exist.
 * Returns { update(dt), stats }.
 */

const USE_OPAL_GLB = true;

function buildTerrain(scene) {
  let glbBattlefield = null;
  let altar = null;

  if (USE_OPAL_GLB && typeof buildOpalBattlefield === 'function') {
    // ---- New GLB-based battlefield ----
    glbBattlefield = buildOpalBattlefield(scene, (info) => {
      // Recompute stats once the GLB has finished loading so the console
      // tally reflects the real triangle count.
      const stats = computeArenaStats(scene);
      const b = TERRAIN.budget;
      const tag = stats.tris <= b.maxTris && stats.drawCalls <= b.maxDrawCalls ? '✓' : '⚠';
      console.log(
        `[Arena] ${tag} ${stats.tris} tris / ${stats.drawCalls} draw calls ` +
        `(budget: ${b.maxTris} tris, ${b.maxDrawCalls} calls). Source: Opal Battlefield GLB.`
      );
    });
  } else {
    // ---- Legacy procedural fallback ----
    buildFloor(scene);
    if (typeof buildPerimeterWall === 'function') buildPerimeterWall(scene);
    if (typeof buildGlowPools     === 'function') buildGlowPools(scene);
    if (typeof buildJungleBushes  === 'function') buildJungleBushes(scene);
    altar = buildAltar(scene);
    window._altarGroup = altar.group;
    const pillars = buildPillars(scene);
    window._pillarGroup = pillars.group;
    const walls = buildWalls(scene);
    window._wallMeshes = walls.meshes;
  }

  // ---- Gameplay overlays (always built — they drive capture / spawn visuals) ----
  buildCapturePoints(scene);
  const spawn = buildSpawnPads(scene);
  window._spawnPads = spawn;

  // ---- Atmosphere (only set here when running the legacy path; the GLB
  // module manages its own lights). ----
  if (!glbBattlefield) {
    scene.background = new THREE.Color(TERRAIN.palette.void);
    if (scene.fog) {
      scene.fog.color = new THREE.Color(0x07101c);
      scene.fog.density = 0.009;
    }
    const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1326, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1c2, 0.5);
    sun.position.set(40, 90, 30);
    scene.add(sun);
  }

  // --- triangle / draw call accounting (initial snapshot) ---
  const stats = computeArenaStats(scene);
  if (typeof window !== 'undefined' && window.console) {
    const b = TERRAIN.budget;
    const tag = stats.tris <= b.maxTris && stats.drawCalls <= b.maxDrawCalls ? '✓' : '⚠';
    const src = glbBattlefield ? 'Opal Battlefield GLB (loading…)' : 'procedural';
    console.log(
      `[Arena] ${tag} ${stats.tris} tris / ${stats.drawCalls} draw calls ` +
      `(budget: ${b.maxTris} tris, ${b.maxDrawCalls} calls). Source: ${src}.`
    );
  }

  function update(dt) {
    if (glbBattlefield && glbBattlefield.update) glbBattlefield.update(dt);
    if (altar) altar.update(dt);
    spawn.update(dt);
  }

  return { update, stats };
}

/**
 * Walk the scene graph and tally per-mesh triangles + a draw-call estimate.
 */
function computeArenaStats(scene) {
  let tris = 0;
  let drawCalls = 0;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    if (!geo) return;
    const index = geo.getIndex();
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const triCount = index ? (index.count / 3) : (pos.count / 3);
    if (o.isInstancedMesh) {
      tris += Math.round(triCount * o.count);
      drawCalls += 1;
    } else {
      tris += Math.round(triCount);
      drawCalls += 1;
    }
  });
  return { tris, drawCalls };
}

/**
 * Unified terrain collision — call from movement code (player + AI).
 * Pushes `pos` out of walls, pillars, altar, and base towers. These work
 * off TERRAIN coordinates directly, so they remain valid even when the
 * legacy meshes are replaced by the GLB battlefield.
 */
function terrainCollide(pos, radius) {
  if (typeof collideWithWalls         === 'function') collideWithWalls(pos, radius);
  if (typeof collideWithPillars       === 'function') collideWithPillars(pos, radius);
  if (typeof collideWithAltar         === 'function' && window._altarGroup) collideWithAltar(pos, radius);
  if (typeof collideWithCaptureTowers === 'function') collideWithCaptureTowers(pos, radius);
}

/**
 * Rounded-rectangle clamp to keep things inside the field.
 */
function clampToArenaRect(pos) {
  const T = TERRAIN;
  const hw = T.fieldW / 2 - 2;
  const hd = T.fieldD / 2 - 2;
  const r = Math.max(0, T.cornerRadius - 2);
  pos.x = Math.max(-hw, Math.min(hw, pos.x));
  pos.z = Math.max(-hd, Math.min(hd, pos.z));
  const cx = (pos.x >  hw - r) ?  (hw - r) : (pos.x < -(hw - r) ? -(hw - r) : pos.x);
  const cz = (pos.z >  hd - r) ?  (hd - r) : (pos.z < -(hd - r) ? -(hd - r) : pos.z);
  const dx = pos.x - cx, dz = pos.z - cz;
  const d  = Math.hypot(dx, dz);
  if (d > r) {
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  }
}

if (typeof window !== 'undefined') {
  window.clampToArena = clampToArenaRect;
  window.buildTerrain = buildTerrain;
  window.terrainCollide = terrainCollide;
}
