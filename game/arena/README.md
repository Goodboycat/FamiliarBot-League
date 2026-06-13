# Arena Map — "Restival" 5v5 MOBA Arena (GLB edition)

The 3D arena used after the main menu. All visual geometry now comes from a
single GLB asset (`assets/opal_battlefield.glb`) instead of being assembled
from many small procedural-mesh modules. The legacy procedural modules
(`floor.js`, `perimeter-wall.js`, `glow-pools.js`, `jungle-bushes.js`,
`walls.js`, `pillars.js`, `altar.js`) have been removed — their meshes are
all included in the GLB.

## Files

| File | Purpose |
| --- | --- |
| `arena-config.js`     | `TERRAIN` constants — field size, palette, capture points, walls, pillars, jungle clusters, spawns, altar, budget. Drives all gameplay coordinates. |
| `opal-battlefield.js` | Loads `assets/opal_battlefield.glb` and inserts it at the scene origin, scaled to `TERRAIN.fieldW × fieldD`. Hydrates `EXT_mesh_gpu_instancing` nodes into `THREE.InstancedMesh`. |
| `capture-points.js`   | 10 capture circles via 5 InstancedMeshes; emissive pads carry the team color; per-instance color for live recolor on capture. |
| `spawn-pads.js`       | Team hex spawn pads with beams. |
| `index.js`            | `buildTerrain(scene)` orchestrator + `terrainCollide` + rounded-rect `clampToArena` + `computeArenaStats`. |

## Load order

These files reference each other as globals (no ES modules) so the order
matters. `game/game-screen.js` loads them in this order:

```html
<script src="./game/arena/arena-config.js"></script>
<script src="./game/arena/opal-battlefield.js"></script>
<script src="./game/arena/capture-points.js"></script>
<script src="./game/arena/spawn-pads.js"></script>
<script src="./game/arena/index.js"></script>
```

## Usage

```js
// After a THREE.Scene + lights exist:
const arena = buildTerrain(scene);

// arena.stats = { tris, drawCalls }
console.log(arena.stats);

function tick(dt) {
  arena.update(dt);
  // when moving an entity:
  terrainCollide(entity.position, entity.radius);
  clampToArena(entity.position);
}
```

`arena-config.js` mutates global `ARENA` and `CAPTURE_POINTS` in place if
they exist, so existing AI / capture-point logic that reads those keeps
working with the new GLB layout.

## The GLB

`assets/opal_battlefield.glb` is a single binary glTF (~3 MB) authored to
cover the full `TERRAIN.fieldW × fieldD` footprint at the origin.

* **Native extents:** X[-100, +100], Z[-50, +50] (200 × 100).
* **Auto-scaled** at runtime to `TERRAIN.fieldW / fieldD` so the in-game
  coordinate space matches `arena-config.js`.
* Uses `EXT_mesh_gpu_instancing` for walls / gems / grass — handled by a
  small custom GLTFLoader plugin in `opal-battlefield.js` (vanilla r128
  ships without that extension).
* Uses `KHR_materials_emissive_strength` and `KHR_materials_unlit` for
  the bright opal accents.

If you ever swap the GLB for one with different native bounds, just update
the `NATIVE_W` / `NATIVE_D` constants near the top of `opal-battlefield.js`.

## Mobile notes

* The GLB module adds **2 lights** (1 hemi + 1 directional sun). The
  capture-point / spawn-pad overlays add a few low-radius point lights for
  team-colored emphasis (still well within the mobile-safe ~7-light budget).
* The triangle / draw-call console tally is logged twice: once on
  `buildTerrain()` (placeholder count while the GLB is fetched) and once
  more when the GLB has parsed.
