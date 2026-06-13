/**
 * FLOOR — Dark stone rounded-rectangle plane.
 * Single ExtrudeGeometry slab + a thin gold rim ring (2 draw calls).
 * Lane bands + center line are plane geometries sharing one material each
 * (kept minimal — total floor stack ≈ 6 draw calls, < 1k tris).
 *
 * Exports: buildFloor(scene) -> { floor, group }
 */

function _roundedRectShape(w, d, r) {
  const hw = w / 2, hd = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo( hw - r, -hd);
  s.quadraticCurveTo( hw, -hd,  hw, -hd + r);
  s.lineTo( hw,  hd - r);
  s.quadraticCurveTo( hw,  hd,  hw - r,  hd);
  s.lineTo(-hw + r,  hd);
  s.quadraticCurveTo(-hw,  hd, -hw,  hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}
window._roundedRectShape = _roundedRectShape;

function buildFloor(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'ArenaFloor';

  // --- 1. Gold rim (slightly larger, sits just below main slab) ---
  const rimShape = _roundedRectShape(
    T.fieldW + T.goldRim * 2,
    T.fieldD + T.goldRim * 2,
    T.cornerRadius + T.goldRim
  );
  const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
    depth: T.thickness * 0.55, bevelEnabled: false, curveSegments: 16,
  });
  rimGeo.rotateX(-Math.PI / 2);
  rimGeo.translate(0, -T.thickness * 0.55, 0);
  const rimMat = new THREE.MeshStandardMaterial({
    color: P.gold, metalness: 0.7, roughness: 0.4,
    emissive: P.gold, emissiveIntensity: 0.12,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.name = 'GoldRim';
  group.add(rim);

  // --- 2. Main stone floor slab ---
  const floorShape = _roundedRectShape(T.fieldW, T.fieldD, T.cornerRadius);
  const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
    depth: T.thickness, bevelEnabled: false, curveSegments: 16,
  });
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, -T.thickness, 0);
  const floorMat = new THREE.MeshStandardMaterial({
    color: P.groundBase, metalness: 0.15, roughness: 0.85,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'StoneSlab';
  floor.userData.isFloor = true;
  floor.position.y = 0.02;
  group.add(floor);

  // --- 3. Lane bands (top + bottom lanes + mid corridor) ---
  // Three plane meshes sharing one material = 1 draw call per plane,
  // but with the same material reference they stay batchable.
  const laneMat = new THREE.MeshStandardMaterial({
    color: P.groundLane, metalness: 0.1, roughness: 0.9,
    transparent: true, opacity: 0.7,
  });
  const laneW = T.fieldW * 0.74;
  const makeLane = (zPos, w, d, op) => {
    const lg = new THREE.PlaneGeometry(w, d);
    lg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(lg, laneMat);
    m.position.set(0, 0.06, zPos);
    m.material.opacity = op;
    return m;
  };
  group.add(makeLane(-28, laneW, 8, 0.65));
  group.add(makeLane( 28, laneW, 8, 0.65));
  group.add(makeLane(  0, laneW * 0.55, 6, 0.45));

  // --- 4. Center divider (thin white line, useful for minimap parity) ---
  const midGeo = new THREE.PlaneGeometry(0.4, T.fieldD * 0.92);
  midGeo.rotateX(-Math.PI / 2);
  const midLine = new THREE.Mesh(
    midGeo,
    new THREE.MeshBasicMaterial({ color: P.centerLine, transparent: true, opacity: 0.45 }),
  );
  midLine.position.y = 0.18;
  group.add(midLine);

  scene.add(group);
  return { floor, group };
}
