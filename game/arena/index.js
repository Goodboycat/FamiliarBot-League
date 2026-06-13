/**
 * TERRAIN INDEX — Orchestrates the "Restival" 5v5 MOBA arena.
 *
 * The visual base of the arena is loaded from `assets/opal_battlefield.glb`.
 * That single GLB contains the floor, perimeter walls, glowing gems, grass,
 * spawn rings (blue/red), the 10 capture-point ring decals and the central
 * altar — so the legacy procedural mesh modules (floor, perimeter-wall,
 * glow-pools, jungle-bushes, walls, pillars, altar) have been removed from
 * this folder. Their gameplay coordinates still live in `arena-config.js`
 * (TERRAIN) so collision/clamp helpers continue to work against the same
 * coordinate space.
 *
 * Gameplay overlays kept on top of the GLB:
 *   • Capture point indicators (5 per side) — drive capture progress visuals
 *   • Spawn pads (player/enemy) — animated team-colored hex pads
 *
 * Call buildTerrain(scene) after the Three.js scene + lights exist.
 * Returns { update(dt), stats }.
 */

function buildTerrain(scene) {
  if (typeof buildOpalBattlefield !== 'function') {
    console.error('[Arena] buildOpalBattlefield() missing — make sure opal-battlefield.js is loaded.');
    return { update() {}, stats: { tris: 0, drawCalls: 0 } };
  }

  // ---- GLB-based battlefield -------------------------------------------
  const glbBattlefield = buildOpalBattlefield(scene, () => {
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

  // ---- Gameplay overlays (always built — they drive capture / spawn visuals)
  buildCapturePoints(scene);
  const spawn = buildSpawnPads(scene);
  window._spawnPads = spawn;

  // --- triangle / draw call accounting (initial snapshot) ---------------
  const stats = computeArenaStats(scene);
  if (typeof window !== 'undefined' && window.console) {
    const b = TERRAIN.budget;
    const tag = stats.tris <= b.maxTris && stats.drawCalls <= b.maxDrawCalls ? '✓' : '⚠';
    console.log(
      `[Arena] ${tag} ${stats.tris} tris / ${stats.drawCalls} draw calls ` +
      `(budget: ${b.maxTris} tris, ${b.maxDrawCalls} calls). Source: Opal Battlefield GLB (loading…).`
    );
  }

  function update(dt) {
    if (glbBattlefield && glbBattlefield.update) glbBattlefield.update(dt);
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
 *
 * Since the procedural mesh modules were removed, only callers that
 * registered collision helpers (e.g. capture-points.js -> collideWithCaptureTowers)
 * contribute here. Movement code keeps clamping to the arena rectangle via
 * clampToArenaRect() below.
 */
function terrainCollide(pos, radius) {
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
  window.clampToArena   = clampToArenaRect;
  window.buildTerrain   = buildTerrain;
  window.terrainCollide = terrainCollide;
}
