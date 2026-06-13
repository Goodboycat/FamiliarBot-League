/**
 * TERRAIN INDEX — Orchestrates the full "Restival" 5v5 MOBA arena.
 *
 * Call buildTerrain(scene) after the Three.js scene + lights exist.
 * Returns { update(dt), stats } — stats includes triangle count + draw call
 * estimate (computed at build time, logged once to console).
 */

function buildTerrain(scene) {
  // 1. Floor (rounded-rect slab + rim + lanes + center line)
  const floor = buildFloor(scene);

  // 2. Perimeter crenellated wall (instanced merlons)
  const perimeter = (typeof buildPerimeterWall === 'function')
    ? buildPerimeterWall(scene) : { group: null, merlonCount: 0 };

  // 3. Glow pools under the central jungle clusters
  const pools = (typeof buildGlowPools === 'function')
    ? buildGlowPools(scene) : { group: null };

  // 4. Jungle bushes (instanced)
  const bushes = (typeof buildJungleBushes === 'function')
    ? buildJungleBushes(scene) : { group: null, count: 0 };

  // 5. Central RESTIVAL altar
  const altar = buildAltar(scene);
  window._altarGroup = altar.group;

  // 6. Capture points (5 per side, instanced)
  buildCapturePoints(scene);

  // 7. Pillars (instanced)
  const pillars = buildPillars(scene);
  window._pillarGroup = pillars.group;

  // 8. Inner walls (instanced)
  const walls = buildWalls(scene);
  window._wallMeshes = walls.meshes;

  // 9. Spawn pads (2 hex pads, per team)
  const spawn = buildSpawnPads(scene);
  window._spawnPads = spawn;

  // 10. Atmosphere — single hemi + single directional sun = mobile-safe
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

  // --- triangle / draw call accounting ---
  const stats = computeArenaStats(scene);
  if (typeof window !== 'undefined' && window.console) {
    const b = TERRAIN.budget;
    const tag = stats.tris <= b.maxTris && stats.drawCalls <= b.maxDrawCalls ? '✓' : '⚠';
    console.log(
      `[Arena] ${tag} ${stats.tris} tris / ${stats.drawCalls} draw calls ` +
      `(budget: ${b.maxTris} tris, ${b.maxDrawCalls} calls). ` +
      `Bushes: ${bushes.count}, Merlons: ${perimeter.merlonCount}.`,
    );
  }

  function update(dt) {
    altar.update(dt);
    spawn.update(dt);
  }

  return { update, stats };
}

/**
 * Walk the scene graph and tally per-mesh triangles + a draw-call estimate.
 * - Instanced meshes count as 1 draw call (regardless of instance count).
 * - Regular meshes count as 1 draw call.
 * - Lines / points / lights are ignored for the draw-call estimate (they cost,
 *   but cheaply on mobile compared to opaque meshes).
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
 * Pushes `pos` out of walls, pillars, altar, and base towers.
 */
function terrainCollide(pos, radius) {
  if (typeof collideWithWalls         === 'function') collideWithWalls(pos, radius);
  if (typeof collideWithPillars       === 'function') collideWithPillars(pos, radius);
  if (typeof collideWithAltar         === 'function') collideWithAltar(pos, radius);
  if (typeof collideWithCaptureTowers === 'function') collideWithCaptureTowers(pos, radius);
}

/**
 * Rounded-rectangle clamp to keep things inside the field.
 * Overrides the global clampToArena used by player.js + ai.js.
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
