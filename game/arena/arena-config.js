/**
 * ARENA CONFIG — Sky Ruins / Opal Plane (3D port)
 *
 * Replaces the small ellipse arena with a LARGE opal-form rectangular field
 * (rounded corners), mirror-symmetric, with 10 capture points (5 per side).
 *
 * Convention:
 *   X axis = lane direction (player base on -X, enemy base on +X)
 *   Z axis = lateral (top lane on -Z, bottom lane on +Z)
 *   Y axis = vertical
 *
 * Source mapping from 2D Phaser preview (108 x 60 units, 1 unit = 10 px):
 *   2D origin (54, 30) → 3D origin (0, 0)
 *   1 source unit ≈ 1.5 world units (gives ~162 x 90 world footprint = "really big")
 */

const TERRAIN = {
  // --- field footprint (world units) ---
  // 2D was 108 x 60 units. We scale ×1.5 -> 162 x 90. Much bigger than the
  // old 100 x 60 ellipse. Rectangular with rounded corners (opal-form).
  fieldW:        162,   // long axis (X)
  fieldD:         90,   // short axis (Z)
  cornerRadius:   14,   // rounded-rect corners
  thickness:       1.2, // floor slab thickness

  // gold rim around floor
  goldRim:         1.6,

  // --- palette (matches 2D source) ---
  palette: {
    groundBase:    0xb2a98a,   // warm sandy-tan
    groundLane:    0xd6c89c,   // lighter sandy lane
    tileLine:      0xc7b98a,   // diagonal tile lines
    innerRing:     0x8a7f5f,   // inner ring stroke
    centerLine:    0xffffff,   // white centerline
    opalLight:     0xc8e6ff,
    opalMid:       0x9ad6ff,
    opalDark:      0x5f8fc7,
    pillar:        0x9ad6ff,
    pillarCap:     0xffffff,
    wall:          0x9ad6ff,
    gold:          0xd6b066,   // rim
    void:          0x05080f,   // background void
    altarCore:     0x88ccff,
    teamPlayer:    0x4cb3ff,   // (was orange in 2D; in this 3D game player = blue)
    teamEnemy:     0xff5577,   // (was purple in 2D; enemy = red here, matches existing UI)
    neutral:       0xffd479,
  },

  // --- 10 capture points (5 per side), mirrored ---
  // Mapping from sky-ruins 2D coords (x,y in 0..108 / 0..60):
  //   wx = (sx - 54) * 1.5     (X)
  //   wz = (sy - 30) * 1.5     (Z)
  // tier ∈ 'base' (R=6.5) | 'middle' (R=5) | 'outer' (R=4.5)
  capturePoints: [
    // PLAYER SIDE (-X)
    { id:'P1',  side:'player', label:'Player Base',         tier:'base',   pos:[-66,   0], radius:6.5 },
    { id:'P2a', side:'player', label:'Player Mid Top',      tier:'middle', pos:[-39, -24], radius:5.0 },
    { id:'P2b', side:'player', label:'Player Mid Bot',      tier:'middle', pos:[-39,  24], radius:5.0 },
    { id:'P3a', side:'player', label:'Player Outer Top',    tier:'outer',  pos:[-15, -30], radius:4.5 },
    { id:'P3b', side:'player', label:'Player Outer Bot',    tier:'outer',  pos:[-15,  30], radius:4.5 },
    // ENEMY SIDE (+X)  -- mirror
    { id:'E1',  side:'enemy',  label:'Enemy Base',          tier:'base',   pos:[ 66,   0], radius:6.5 },
    { id:'E2a', side:'enemy',  label:'Enemy Mid Top',       tier:'middle', pos:[ 39, -24], radius:5.0 },
    { id:'E2b', side:'enemy',  label:'Enemy Mid Bot',       tier:'middle', pos:[ 39,  24], radius:5.0 },
    { id:'E3a', side:'enemy',  label:'Enemy Outer Top',     tier:'outer',  pos:[ 15, -30], radius:4.5 },
    { id:'E3b', side:'enemy',  label:'Enemy Outer Bot',     tier:'outer',  pos:[ 15,  30], radius:4.5 },
  ],

  // --- short walls (x1,z1,x2,z2 world units) ---
  walls: [
    // Center jungle walls flanking mid
    [-6, -12,   6, -12],
    [-6,  12,   6,  12],
    [ 0,  -6,   0,   6],
    // Lane side-walls top
    [-21, -21,  -9, -21],
    [  9, -21,  21, -21],
    // Lane side-walls bottom
    [-21,  21,  -9,  21],
    [  9,  21,  21,  21],
    // Inner base shielding walls (player)
    [-57, -12, -48, -12],
    [-57,  12, -48,  12],
    // Inner base shielding walls (enemy)
    [ 48, -12,  57, -12],
    [ 48,  12,  57,  12],
    // Mid choke walls
    [-6,   0,  -3,   0],
    [ 3,   0,   6,   0],
  ],

  // --- decorative pillars (x,z world units) ---
  pillars: [
    [-51, -27], [-51,  27],
    [-27,   0],
    [  0, -27], [  0,  27],
    [ 27,   0],
    [ 51, -27], [ 51,  27],
    // outer-corner ornament pillars
    [-72, -33], [-72,  33],
    [ 72, -33], [ 72,  33],
  ],

  // --- spawn points (where teams appear at match start) ---
  spawns: {
    player: { pos:[-75,   0], radius: 4.5 },   // behind player base
    enemy:  { pos:[ 75,   0], radius: 4.5 },   // behind enemy base
  },

  // --- central altar (between teams, neutral capture / objective) ---
  altar: { pos:[0, 0], radius: 7, height: 2.2 },
};

// Replace the original ARENA so clampToArena() and AI still work, but with new dims.
// We keep .shape = 'rect' so we can swap clamp logic in scene.js.
if (typeof ARENA !== 'undefined') {
  ARENA.width  = TERRAIN.fieldW;
  ARENA.depth  = TERRAIN.fieldD;
  ARENA.shape  = 'rect';
  ARENA.cornerRadius = TERRAIN.cornerRadius;
}

// Replace CAPTURE_POINTS with mirrored 10-point Sky Ruins layout.
// Keep the same shape the rest of the codebase expects.
if (typeof CAPTURE_POINTS !== 'undefined') {
  // mutate in place so other modules that already captured a reference still see updates
  CAPTURE_POINTS.length = 0;
  TERRAIN.capturePoints.forEach(cp => {
    CAPTURE_POINTS.push({
      id: cp.id,
      side: cp.side,
      label: cp.label,
      position: cp.pos,
      owner: cp.side,
      captureRadius: cp.radius,
      captureTime: cp.tier === 'base' ? 5 : (cp.tier === 'middle' ? 4 : 3),
      isActive: true,
      tier: cp.tier,
    });
  });
}
