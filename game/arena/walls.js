/**
 * WALLS — Inner short barriers, rendered via a single InstancedMesh.
 *
 * 1 draw call for all wall bodies, 1 for all caps. Material is shared.
 * Collision data is preserved on a per-segment array (no per-instance mesh).
 *
 * Exports: buildWalls(scene) -> { group, meshes }   (`meshes` kept for back-compat)
 */

function buildWalls(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'Walls';

  const wallH = 1.8;
  const wallT = 1.2;
  const N = T.walls.length;

  // Shared geometry (1 box) instanced N times for the body + cap
  const bodyGeo = new THREE.BoxGeometry(1, wallH, wallT);    // we'll scale X per instance via matrix
  const bodyMat = new THREE.MeshStandardMaterial({
    color: P.stoneWall, metalness: 0.25, roughness: 0.7,
    emissive: P.stoneCap, emissiveIntensity: 0.05,
  });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
  bodies.name = 'WallBodiesInstanced';
  bodies.userData.isWall = true;

  const capGeo = new THREE.BoxGeometry(1, 0.18, wallT * 0.55);
  const capMat = new THREE.MeshBasicMaterial({
    color: P.poolGlow, transparent: true, opacity: 0.8,
  });
  const caps = new THREE.InstancedMesh(capGeo, capMat, N);
  caps.name = 'WallCapsInstanced';

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  // collision array (back-compat shape: array of meshes-like objects)
  const meshes = [];

  T.walls.forEach((seg, i) => {
    const [x1, z1, x2, z2] = seg;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) + wallT * 0.6;
    const angle = Math.atan2(dz, dx);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    // body matrix
    pos.set(cx, wallH / 2, cz);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    scale.set(len, 1, 1);
    m.compose(pos, quat, scale);
    bodies.setMatrixAt(i, m);

    // cap matrix (slightly above body)
    pos.set(cx, wallH + 0.09, cz);
    scale.set(len * 0.96, 1, 1);
    m.compose(pos, quat, scale);
    caps.setMatrixAt(i, m);

    meshes.push({
      userData: { isWall: true, segment: seg },
      // expose minimal interface used by collideWithWalls
    });
  });

  bodies.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;

  group.add(bodies);
  group.add(caps);
  scene.add(group);

  return { group, meshes };
}

// Wall collision (uses TERRAIN.walls directly — no per-instance mesh needed)
function collideWithWalls(pos, radius) {
  if (typeof TERRAIN === 'undefined' || !TERRAIN.walls) return;
  const wallT = 1.2;
  TERRAIN.walls.forEach(seg => {
    const [x1, z1, x2, z2] = seg;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const ux = dx / len, uz = dz / len;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const px = pos.x - cx, pz = pos.z - cz;
    const along = px * ux + pz * uz;
    const perp  = -px * uz + pz * ux;
    const halfL = len / 2 + wallT * 0.3;
    const halfT = wallT / 2 + radius;
    if (Math.abs(along) < halfL && Math.abs(perp) < halfT) {
      const sign = perp >= 0 ? 1 : -1;
      const pushPerp = (halfT - Math.abs(perp)) * sign;
      pos.x += -uz * pushPerp;
      pos.z +=  ux * pushPerp;
    }
  });
}
