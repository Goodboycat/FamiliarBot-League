/**
 * TERRAIN INDEX — Orchestrates the full Sky Ruins / Opal Plane terrain.
 *
 * Call buildTerrain(scene) after the Three.js scene + lights exist.
 * Returns { update(dt) } — call from the main animation loop.
 *
 * Adds combined collision via terrainCollide(pos, radius).
 */

function buildTerrain(scene) {
  // 1. floor (opal slab + rim + lanes + tile pattern + center line + accents)
  buildFloor(scene);

  // 2. central altar (objective anchor)
  const altar = buildAltar(scene);
  window._altarGroup = altar.group;

  // 3. capture points (10 mirrored towers)
  buildCapturePoints(scene);

  // 4. pillars (decorative + light)
  const pillars = buildPillars(scene);
  window._pillarGroup = pillars.group;

  // 5. short walls (jungle / base shields)
  const walls = buildWalls(scene);
  window._wallMeshes = walls.meshes;

  // 6. spawn pads (team-colored, behind each base)
  const spawn = buildSpawnPads(scene);
  window._spawnPads = spawn;

  // 7. atmospheric scene background tweaks (void + soft fog)
  scene.background = new THREE.Color(TERRAIN.palette.void);
  if (scene.fog) {
    scene.fog.color = new THREE.Color(0x07101c);
    scene.fog.density = 0.009; // softer fog for a much bigger arena
  }

  // 8. extra global lights to read the bigger plane
  const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1326, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1c2, 0.45);
  sun.position.set(40, 80, 30);
  scene.add(sun);

  function update(dt) {
    altar.update(dt);
    spawn.update(dt);
  }

  return { update };
}

/**
 * Unified terrain collision — call from movement code (player + AI).
 * Pushes `pos` out of walls, pillars, altar, and base towers.
 */
function terrainCollide(pos, radius) {
  collideWithWalls(pos, radius);
  collideWithPillars(pos, radius);
  collideWithAltar(pos, radius);
  collideWithCaptureTowers(pos, radius);
}

/**
 * Rounded-rectangle clamp to keep things inside the field (replaces ellipse).
 * Overrides the global clampToArena used by player.js + ai.js.
 */
function clampToArenaRect(pos) {
  const T = TERRAIN;
  const hw = T.fieldW / 2 - 2;
  const hd = T.fieldD / 2 - 2;
  const r = Math.max(0, T.cornerRadius - 2);
  // 1. clamp to axis-aligned rect
  pos.x = Math.max(-hw, Math.min(hw, pos.x));
  pos.z = Math.max(-hd, Math.min(hd, pos.z));
  // 2. rounded-corner constraint
  const cx = (pos.x >  hw - r) ?  (hw - r) : (pos.x < -(hw - r) ? -(hw - r) : pos.x);
  const cz = (pos.z >  hd - r) ?  (hd - r) : (pos.z < -(hd - r) ? -(hd - r) : pos.z);
  const dx = pos.x - cx, dz = pos.z - cz;
  const d  = Math.hypot(dx, dz);
  if (d > r) {
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  }
}

// Replace the global clampToArena (was ellipse-based)
if (typeof window !== 'undefined') {
  window.clampToArena = clampToArenaRect;
}
