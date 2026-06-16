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

  // Spawn portals (GLB-based) — falls back to procedural hex pads if the
  // portal GLBs fail to load. The portal module internally calls
  // buildSpawnPads({ silent: true }) and hides those pads once the GLBs
  // are in, so we never end up with both visible at the same time.
  const spawn = (typeof buildSpawnPortals === 'function')
    ? buildSpawnPortals(scene)
    : buildSpawnPads(scene);
  window._spawnPads = spawn;

  // Tall-grass bushes (Pokémon-Unite-style hide mechanic). The mechanic is
  // wired in game-world.js / ai.js — this module only owns the visuals +
  // pointInGrass() volume query.
  const grass = (typeof buildTallGrass === 'function') ? buildTallGrass(scene) : null;
  window._tallGrass = grass;

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
    if (spawn && spawn.update) spawn.update(dt);
    if (grass && grass.update) grass.update(dt);
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
 * Handles ALL solid arena geometry:
 *   • Capture-point towers (all tiers — base / middle / outer)
 *   • Inner wall segments (TERRAIN.walls — axis-aligned thick segments)
 *   • Pillars (TERRAIN.pillars — vertical cylinders)
 *   • Central altar (TERRAIN.altar — vertical cylinder)
 *   • Perimeter wall (TERRAIN.fieldW × TERRAIN.fieldD rounded rect)
 *
 * Each obstacle pushes `pos` (a {x,z} or THREE.Vector3) out of itself by
 * the minimum amount needed so that the actor's `radius` no longer overlaps.
 * Callers should invoke `terrainCollide` AFTER applying their movement
 * delta and BEFORE writing the position back to the mesh.
 */
function terrainCollide(pos, radius) {
  const T = (typeof TERRAIN !== 'undefined') ? TERRAIN : (typeof window !== 'undefined' && window.TERRAIN);
  if (!T) return;
  const r = (radius != null) ? radius : 1.2;

  // 1) Capture-point towers — all tiers, not just base.
  collideWithAllCaptureTowers(pos, r);

  // Legacy helper still exposed for back-compat; it's now redundant with
  // the all-tier version above, so we skip it to avoid double-pushing.

  // 2) Inner wall segments — each entry is [x1, z1, x2, z2] in world units.
  //    Treat each wall as a capsule (thick segment) of half-thickness 0.7.
  const WALL_HALF_T = 0.7;
  const walls = T.walls || [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    pushOutOfSegment(pos, r, w[0], w[1], w[2], w[3], WALL_HALF_T);
  }

  // 3) Pillars — vertical cylinders, radius ~1.0 world units.
  const PILLAR_R = 1.0;
  const pillars = T.pillars || [];
  for (let i = 0; i < pillars.length; i++) {
    const p = pillars[i];
    pushOutOfCircle(pos, r, p[0], p[1], PILLAR_R);
  }

  // 4) Central altar — vertical cylinder.
  if (T.altar && T.altar.pos) {
    const ar = (T.altar.radius != null) ? T.altar.radius : 7.0;
    pushOutOfCircle(pos, r, T.altar.pos[0], T.altar.pos[1], ar);
  }

  // 5) Perimeter — keep actor INSIDE the rounded rectangle (this is the
  //    real "wall hits" boundary; the arena rect clamp below is the same
  //    operation but expressed as a clamp rather than a push).
  clampToArenaRect(pos);
}

// Push `pos` out of a vertical cylinder centered at (cx,cz) with radius `obsR`,
// inflated by the actor's radius `r`.
function pushOutOfCircle(pos, r, cx, cz, obsR) {
  const dx = pos.x - cx, dz = pos.z - cz;
  const d = Math.hypot(dx, dz);
  const minD = r + obsR;
  if (d > 1e-4 && d < minD) {
    const push = (minD - d);
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
  } else if (d <= 1e-4) {
    // exactly overlapping centre — nudge along +X
    pos.x += minD;
  }
}

// Push `pos` out of an axis-agnostic thick line segment (capsule).
function pushOutOfSegment(pos, r, ax, az, bx, bz, halfT) {
  // Project pos onto the segment AB; clamp t to [0,1]; treat the closest
  // point on the segment as the centre of a capsule of radius (halfT).
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 1e-6) {
    t = ((pos.x - ax) * dx + (pos.z - az) * dz) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
  }
  const cx = ax + dx * t;
  const cz = az + dz * t;
  pushOutOfCircle(pos, r, cx, cz, halfT);
}

// All-tier capture-tower collision (base + middle + outer). Tower physical
// footprint matches the tower cylinder radius declared in capture-points.js:
//   base   → 1.8, middle → 1.3, outer → 1.0
function collideWithAllCaptureTowers(pos, radius) {
  const CPs = (typeof CAPTURE_POINTS !== 'undefined') ? CAPTURE_POINTS
            : (typeof window !== 'undefined' && window.CAPTURE_POINTS) || [];
  for (let i = 0; i < CPs.length; i++) {
    const cp = CPs[i];
    const tier = cp.tier || 'middle';
    const towerR = tier === 'base' ? 1.8 : (tier === 'middle' ? 1.3 : 1.0);
    const cx = (cp.position && cp.position[0]) || 0;
    const cz = (cp.position && cp.position[1]) || 0;
    pushOutOfCircle(pos, radius, cx, cz, towerR);
  }
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
  window.clampToArena              = clampToArenaRect;
  window.buildTerrain              = buildTerrain;
  window.terrainCollide            = terrainCollide;
  window.collideWithAllCaptureTowers = collideWithAllCaptureTowers;
  window.pushOutOfCircle           = pushOutOfCircle;
  window.pushOutOfSegment          = pushOutOfSegment;
}
