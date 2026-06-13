/**
 * ARENA CONFIG — "Restival" 5v5 MOBA Arena (v2 — top-down reference rebuild)
 *
 * Mirror-symmetric rounded-rectangle field with:
 *   • 2 team bases (blue = player on -X, red = enemy on +X)
 *   • 5 capture points per side (10 total) — Base, Mid-Top, Mid-Bot, Outer-Top, Outer-Bot
 *   • Central neutral "RESTIVAL" altar between two glowing jungle pools
 *   • 4 jungle bush clusters (top/bottom mirrored) with glow-pool centers
 *   • Crenellated stone perimeter wall (instanced)
 *   • Inner team-colored wall segments shielding each base
 *
 * Heightmap reference: walls + crenellations + pillars are the bright (raised)
 * elements; lanes / jungle floors are mid-grey (flat); pools are darkest
 * (slight recess). We bake those Y offsets into the modules below.
 *
 * Axis convention:
 *   X = lane direction (player -X, enemy +X)
 *   Z = lateral (top lane -Z, bottom lane +Z)
 *   Y = vertical
 */

const TERRAIN = {
  // --- field footprint (world units) ---
  fieldW:        162,   // long axis (X)
  fieldD:         90,   // short axis (Z)
  cornerRadius:   18,   // larger rounding to match oval-stadium reference
  thickness:       1.2, // floor slab thickness

  goldRim:         1.4,

  // --- mobile / draw-call budget targets (used by index.js stats) ---
  budget: {
    maxTris:        32000,
    maxDrawCalls:     90,   // ~3-frame stable on mid-tier mobile GPUs
  },

  // --- palette (tuned to reference render) ---
  palette: {
    groundBase:    0x4a4a44,   // dark stone walkway
    groundLane:    0x5c5a50,   // slightly lighter lane stripe
    tileLine:      0x6f6a55,
    innerRing:     0x3a3830,
    centerLine:    0xe6e2c8,
    bushDark:      0x1d3a1a,   // jungle bush base
    bushLight:     0x3f6e2c,   // jungle bush highlight
    poolGlow:      0x39d6ff,   // cyan glow pools beneath jungle
    poolDeep:      0x0a3b5e,
    stoneWall:     0x6b665a,   // perimeter crenellated wall
    stoneCap:      0x8a8576,
    altarStone:    0x55504a,
    altarCore:     0xffd479,
    pillar:        0x9ad6ff,
    pillarCap:     0xffffff,
    gold:          0xd6b066,
    void:          0x06090f,
    teamPlayer:    0x3aa3ff,   // BLUE side
    teamEnemy:     0xff3b55,   // RED side
    teamPlayerSoft:0x6fc1ff,
    teamEnemySoft: 0xff7388,
    neutral:       0xffd479,
  },

  // --- 10 capture points (5 per side, mirrored on Z axis) ---
  // Layout matches reference top-down: a vertical column of 5 circles per side.
  //   Base (largest) sits closest to the team's spawn (deep in base)
  //   Two Mid tiers flank the center
  //   Two Outer tiers sit out wide on top/bottom lanes
  capturePoints: [
    // PLAYER (blue) side -X
    { id:'P1',  side:'player', label:'Player Base',         tier:'base',   pos:[-58,   0], radius:6.0 },
    { id:'P2a', side:'player', label:'Player Mid Top',      tier:'middle', pos:[-36, -20], radius:5.0 },
    { id:'P2b', side:'player', label:'Player Mid Bot',      tier:'middle', pos:[-36,  20], radius:5.0 },
    { id:'P3a', side:'player', label:'Player Outer Top',    tier:'outer',  pos:[-22, -34], radius:4.4 },
    { id:'P3b', side:'player', label:'Player Outer Bot',    tier:'outer',  pos:[-22,  34], radius:4.4 },
    // ENEMY (red) side +X — mirrored
    { id:'E1',  side:'enemy',  label:'Enemy Base',          tier:'base',   pos:[ 58,   0], radius:6.0 },
    { id:'E2a', side:'enemy',  label:'Enemy Mid Top',       tier:'middle', pos:[ 36, -20], radius:5.0 },
    { id:'E2b', side:'enemy',  label:'Enemy Mid Bot',       tier:'middle', pos:[ 36,  20], radius:5.0 },
    { id:'E3a', side:'enemy',  label:'Enemy Outer Top',     tier:'outer',  pos:[ 22, -34], radius:4.4 },
    { id:'E3b', side:'enemy',  label:'Enemy Outer Bot',     tier:'outer',  pos:[ 22,  34], radius:4.4 },
  ],

  // --- 4 mirrored jungle bush clusters (top + bottom, blue + red side) ---
  // Each cluster has a center pool + ring of bushes.
  jungleClusters: [
    { id:'JL-TL', pos:[-14, -16], radius: 6.5, bushCount: 7 }, // top-left
    { id:'JL-BL', pos:[-14,  16], radius: 6.5, bushCount: 7 }, // bot-left
    { id:'JL-TR', pos:[ 14, -16], radius: 6.5, bushCount: 7 }, // top-right
    { id:'JL-BR', pos:[ 14,  16], radius: 6.5, bushCount: 7 }, // bot-right
  ],

  // --- 4 mirrored side-bush clusters for outer lane jungle ---
  sideBushes: [
    { pos:[-46, -28], radius: 3.5, bushCount: 4 },
    { pos:[-46,  28], radius: 3.5, bushCount: 4 },
    { pos:[ 46, -28], radius: 3.5, bushCount: 4 },
    { pos:[ 46,  28], radius: 3.5, bushCount: 4 },
  ],

  // --- inner short wall segments (x1,z1,x2,z2 — instanced as boxes) ---
  walls: [
    // jungle borders top
    [-22, -10,  -8, -10],
    [  8, -10,  22, -10],
    // jungle borders bottom
    [-22,  10,  -8,  10],
    [  8,  10,  22,  10],
    // base shielding walls (player)
    [-48, -14, -40, -14],
    [-48,  14, -40,  14],
    // base shielding walls (enemy)
    [ 40, -14,  48, -14],
    [ 40,  14,  48,  14],
    // outer lane top/bottom dividers
    [-30, -28, -22, -28],
    [ 22, -28,  30, -28],
    [-30,  28, -22,  28],
    [ 22,  28,  30,  28],
  ],

  // --- decorative pillars (x,z) — instanced low-poly ---
  pillars: [
    [-44, -32], [-44,  32],
    [ 44, -32], [ 44,  32],
    [-72, -12], [-72,  12],
    [ 72, -12], [ 72,  12],
    [  0, -34], [  0,  34],
  ],

  // --- spawn points (deep in base, behind the Base capture tower) ---
  spawns: {
    player: { pos:[-74,   0], radius: 4.0 },
    enemy:  { pos:[ 74,   0], radius: 4.0 },
  },

  // --- central altar ("RESTIVAL") ---
  altar: { pos:[0, 0], radius: 7.0, height: 1.6, label: 'RESTIVAL' },

  // --- perimeter crenellation count (instanced merlons around outer wall) ---
  perimeter: {
    merlonCount: 40,           // total instances around the rounded rect
    merlonW:     2.8,
    merlonH:     2.0,
    merlonT:     1.4,
    wallH:       1.0,          // base wall slab
    inset:       0.0,          // sits on rim
  },
};

// --- back-compat shims so the rest of the game keeps working ---
if (typeof ARENA !== 'undefined') {
  ARENA.width        = TERRAIN.fieldW;
  ARENA.depth        = TERRAIN.fieldD;
  ARENA.shape        = 'rect';
  ARENA.cornerRadius = TERRAIN.cornerRadius;
}

if (typeof CAPTURE_POINTS !== 'undefined') {
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

// Expose globals explicitly (helps when arena modules are bundled or executed in
// non-<script>-tag contexts such as testing harnesses)
if (typeof window !== 'undefined') {
  window.TERRAIN = TERRAIN;
}
