# Arena Map — "Restival" 5v5 MOBA Arena (v2)

The 3D arena used after the main menu. Rebuilt to match the new top-down
reference: rounded-rectangle stone field, crenellated perimeter wall,
4 jungle bush clusters with cyan glow pools, central **RESTIVAL** altar,
and 10 capture points (5 per side, mirrored).

## Optimization

All large repeating geometry is rendered through **InstancedMesh** so the
whole arena stays comfortably under the mobile budget defined in
`arena-config.js`:

```js
TERRAIN.budget = { maxTris: 32000, maxDrawCalls: 90 };
```

At build time the orchestrator walks the scene and logs:

```
[Arena] ✓ <tris> tris / <draw calls> draw calls (budget: 32000 tris, 90 calls). Bushes: 44, Merlons: 40.
```

Each InstancedMesh counts as **1 draw call** regardless of instance count.

| Group | Geometry | Draw calls | Notes |
| --- | --- | --- | --- |
| Floor slab + rim | 2 extrude meshes | 2 | shared materials |
| Lane bands + center line | 4 planes | 4 | |
| Perimeter wall slab | 1 extrude | 1 | hollow rounded-rect |
| Perimeter merlons | 1 InstancedMesh (40×) | 1 | crenellation teeth |
| Glow pool discs + halos | 2 InstancedMeshes | 2 | central jungle pools |
| Jungle bushes | 1 InstancedMesh (~44×) | 1 | icosahedron, flat-shaded |
| Capture pads / rings / towers / crowns / orbs | 5 InstancedMeshes (10× each) | 5 | per-instance color |
| Pillars (shaft / base / cap) | 3 InstancedMeshes (10× each) | 3 | low-poly cyl + sphere |
| Inner walls (body / cap) | 2 InstancedMeshes (12× each) | 2 | |
| Altar | 1 slab + 1 trim + 1 label + core + 2 rings | 6 | label is a CanvasTexture plane |
| Spawn pads | 2 hex pads × 3 sub-meshes | 6 | |
| Lights | 1 hemi + 1 sun + 2 spawn + 1 altar + 2 base CP | n/a | mobile-safe (~7 lights) |

**Emissive circles** — the user-facing requirement is honoured by giving
the capture-point **pads** a `MeshStandardMaterial` with `emissiveIntensity = 1.4`
tinted to the side color, and the **glow pools** a high-intensity emissive
cyan disc — both visible as bright circles in the top-down minimap.

## Files

| File | Purpose |
| --- | --- |
| `arena-config.js`   | `TERRAIN` constants — field size, palette, capture points, walls, pillars, jungle clusters, spawns, altar, budget. |
| `index.js`          | `buildTerrain(scene)` orchestrator + `terrainCollide` + rounded-rect `clampToArena` + `computeArenaStats`. |
| `floor.js`          | Rounded-rect stone slab, gold rim, lane bands, center line. Exposes `_roundedRectShape` for reuse. |
| `perimeter-wall.js` | Crenellated outer wall (1 extrude slab + 1 InstancedMesh of merlons). |
| `glow-pools.js`     | Cyan emissive discs + halos under central jungle clusters (InstancedMesh). |
| `jungle-bushes.js`  | Low-poly icosahedron bushes, all clusters in a single InstancedMesh. |
| `walls.js`          | Inner short barriers (InstancedMesh bodies + caps). |
| `pillars.js`        | Decorative columns (3 InstancedMeshes: shaft / base / cap). |
| `capture-points.js` | 10 capture circles via 5 InstancedMeshes; emissive pads carry the team color; per-instance color for live recolor on capture. |
| `spawn-pads.js`     | Team hex spawn pads with beams. |
| `altar.js`          | Central **RESTIVAL** stone platform with CanvasTexture label + floating core + rotating rings. |

## Load order

These files reference each other as globals (no ES modules) so the order
matters. The game-screen loader already includes them in this order:

```html
<script src="./game/arena/arena-config.js"></script>
<script src="./game/arena/floor.js"></script>
<script src="./game/arena/perimeter-wall.js"></script>
<script src="./game/arena/glow-pools.js"></script>
<script src="./game/arena/jungle-bushes.js"></script>
<script src="./game/arena/walls.js"></script>
<script src="./game/arena/pillars.js"></script>
<script src="./game/arena/capture-points.js"></script>
<script src="./game/arena/spawn-pads.js"></script>
<script src="./game/arena/altar.js"></script>
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
working with the new layout.

## Mobile notes

* Only **~7 dynamic lights** are added (1 hemi + 1 directional + 2 spawn
  point lights + 1 altar + 2 base capture-point lights). Middle and outer
  capture points use **emissive materials only** to stay cheap on mobile.
* All instanced geometries use **low-poly counts** (cylinder segs ≤ 12,
  sphere segs ≤ 12, torus tubular segs ≤ 32) so individual instances stay
  small even at 40-ish copies.
* The perimeter slab is the only ExtrudeGeometry with a hole — keep its
  `curveSegments` ≤ 16.
* No textures are loaded from disk except the small (512×128) altar label
  CanvasTexture — keeps the network / VRAM footprint near zero.
