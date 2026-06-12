# Arena Map — Sky Ruins / Opal Plane

The 3D arena/terrain used after the main menu. Ported from the
**My-Indie-Game** project (`js/terrain/`).

## Files

| File | Purpose |
| --- | --- |
| `arena-config.js` | `TERRAIN` constants — field size, palette, capture points, walls, pillars, spawns, altar. |
| `index.js`        | `buildTerrain(scene)` orchestrator + `terrainCollide(pos, radius)` + rounded-rect `clampToArena`. |
| `floor.js`        | Opal rounded-rectangle plane, gold rim, lane bands, tile pattern, center line. |
| `walls.js`        | Short blocky barriers (`buildWalls(scene)`). |
| `pillars.js`      | Decorative + light pillars (`buildPillars(scene)`). |
| `capture-points.js` | 10 mirrored capture towers (`buildCapturePoints(scene)`). |
| `spawn-pads.js`   | Team-colored spawn pads behind each base (`buildSpawnPads(scene)`). |
| `altar.js`        | Central neutral altar / objective (`buildAltar(scene)`). |

## Load order

These files reference each other as plain globals (no ES modules), so the
include order matters. Load them like this from your `index.html` (or
arena boot script) after `three.min.js` is available:

```html
<script src="./game/arena/arena-config.js"></script>
<script src="./game/arena/floor.js"></script>
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

function tick(dt) {
  arena.update(dt);
  // when moving an entity:
  terrainCollide(entity.position, entity.radius);
  clampToArena(entity.position);
}
```

`arena-config.js` also mutates global `ARENA` and `CAPTURE_POINTS` in place
if they exist — so existing AI / capture-point logic that reads those keeps
working with the new rectangular arena.
