/**
 * WALLS — Short blocky barriers in Sky Ruins style.
 * Each wall is a segment defined by (x1,z1,x2,z2). We extrude a thin glowing
 * box along the segment, slightly above the floor.
 *
 * Exports: buildWalls(scene) -> { group, meshes }
 */

function buildWalls(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'Walls';

  const wallH = 1.8;
  const wallT = 1.2; // thickness

  const baseMat = new THREE.MeshStandardMaterial({
    color: P.wall, metalness: 0.4, roughness: 0.45,
    emissive: P.opalMid, emissiveIntensity: 0.5,
  });
  const capMat = new THREE.MeshBasicMaterial({
    color: P.opalLight, transparent: true, opacity: 0.85,
  });

  const meshes = [];

  T.walls.forEach(([x1, z1, x2, z2]) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) + wallT * 0.6;
    const angle = Math.atan2(dz, dx);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    // Body
    const geo = new THREE.BoxGeometry(len, wallH, wallT);
    const wall = new THREE.Mesh(geo, baseMat);
    wall.position.set(cx, wallH / 2, cz);
    wall.rotation.y = -angle; // box X-axis aligns with segment
    wall.userData.isWall = true;
    wall.userData.segment = [x1, z1, x2, z2];
    group.add(wall);
    meshes.push(wall);

    // Glowing top cap (slightly thinner)
    const capGeo = new THREE.BoxGeometry(len * 0.96, 0.18, wallT * 0.55);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(cx, wallH + 0.09, cz);
    cap.rotation.y = -angle;
    group.add(cap);

    // Soft point light along longer walls
    if (len > 8) {
      const pl = new THREE.PointLight(P.opalMid, 0.5, 10);
      pl.position.set(cx, wallH + 1.2, cz);
      group.add(pl);
    }
  });

  scene.add(group);
  return { group, meshes };
}

// AABB-style wall collision helper for AI / player movement.
// Pushes `pos` (THREE.Vector3) out of any wall it intersects.
// Call inside the movement update.
function collideWithWalls(pos, radius) {
  if (!window._wallMeshes) return;
  const wallH = 1.8, wallT = 1.2;
  window._wallMeshes.forEach(w => {
    const [x1, z1, x2, z2] = w.userData.segment;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const ux = dx / len, uz = dz / len;
    // project (pos - segment center) onto segment axis
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const px = pos.x - cx, pz = pos.z - cz;
    const along = px * ux + pz * uz;
    const perp  = -px * uz + pz * ux;
    const halfL = len / 2 + wallT * 0.3;
    const halfT = wallT / 2 + radius;
    if (Math.abs(along) < halfL && Math.abs(perp) < halfT) {
      // push out along perp direction
      const sign = perp >= 0 ? 1 : -1;
      const pushPerp = (halfT - Math.abs(perp)) * sign;
      pos.x += -uz * pushPerp;
      pos.z +=  ux * pushPerp;
    }
  });
}
