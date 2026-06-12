/**
 * FLOOR — Opal-form rounded-rectangle plane.
 * Sandy-tan base, lighter sandy lane bands, diagonal tile pattern, white
 * center line, inner ring, gold rounded rim, iridescent opal accents.
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

function buildFloor(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'OpalFloor';

  // --- 1. Gold rim (slightly larger, sits below main floor) ---
  const rimShape = _roundedRectShape(
    T.fieldW + T.goldRim * 2,
    T.fieldD + T.goldRim * 2,
    T.cornerRadius + T.goldRim
  );
  const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: T.thickness * 0.6, bevelEnabled: false });
  rimGeo.rotateX(-Math.PI / 2);
  rimGeo.translate(0, -T.thickness * 0.6, 0);
  const rimMat = new THREE.MeshStandardMaterial({
    color: P.gold, metalness: 0.7, roughness: 0.35,
    emissive: P.gold, emissiveIntensity: 0.18,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.name = 'GoldRim';
  group.add(rim);

  // --- 2. Main opal floor slab ---
  const floorShape = _roundedRectShape(T.fieldW, T.fieldD, T.cornerRadius);
  const floorGeo = new THREE.ExtrudeGeometry(floorShape, { depth: T.thickness, bevelEnabled: false });
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, -T.thickness, 0);
  const floorMat = new THREE.MeshStandardMaterial({
    color: P.groundBase, metalness: 0.25, roughness: 0.7,
    emissive: P.opalDark, emissiveIntensity: 0.05,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'OpalSlab';
  floor.userData.isFloor = true;
  floor.position.y = 0.02;
  group.add(floor);

  // --- 3. Lighter sandy lane bands (top + bottom lanes) ---
  const laneMat = new THREE.MeshStandardMaterial({
    color: P.groundLane, metalness: 0.2, roughness: 0.75,
    transparent: true, opacity: 0.85,
  });
  const laneW = T.fieldW * 0.78;
  const laneD = 14;
  [-24, 24].forEach(zPos => {
    const lg = new THREE.PlaneGeometry(laneW, laneD);
    lg.rotateX(-Math.PI / 2);
    const lane = new THREE.Mesh(lg, laneMat);
    lane.position.set(0, 0.08, zPos);
    lane.name = 'LaneBand';
    group.add(lane);
  });
  // mid corridor band (thinner)
  const midBand = new THREE.Mesh(
    new THREE.PlaneGeometry(laneW * 0.55, 8).rotateX(-Math.PI / 2),
    laneMat.clone()
  );
  midBand.material.opacity = 0.55;
  midBand.position.set(0, 0.07, 0);
  group.add(midBand);

  // --- 4. Diagonal tile pattern (line grid) ---
  const tileGroup = new THREE.Group();
  tileGroup.name = 'TileGrid';
  const tileMat = new THREE.LineBasicMaterial({ color: P.tileLine, transparent: true, opacity: 0.4 });
  const tile = 6;
  const halfW = T.fieldW / 2 - 4;
  const halfD = T.fieldD / 2 - 4;

  // diagonal '/' lines
  for (let c = -halfW - halfD; c < halfW + halfD; c += tile) {
    // line y = x + c, clip to field rectangle
    const pts = _clipLineToRect((x) => x + c, -halfW, halfW, -halfD, halfD);
    if (pts) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pts[0].x, 0.12, pts[0].z),
        new THREE.Vector3(pts[1].x, 0.12, pts[1].z),
      ]);
      tileGroup.add(new THREE.Line(g, tileMat));
    }
  }
  // diagonal '\' lines
  for (let c = -halfW - halfD; c < halfW + halfD; c += tile) {
    const pts = _clipLineToRect((x) => -x + c, -halfW, halfW, -halfD, halfD);
    if (pts) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pts[0].x, 0.12, pts[0].z),
        new THREE.Vector3(pts[1].x, 0.12, pts[1].z),
      ]);
      tileGroup.add(new THREE.Line(g, tileMat));
    }
  }
  group.add(tileGroup);

  // --- 5. Inner ring stroke (rounded-rect outline inset) ---
  const innerShape = _roundedRectShape(T.fieldW - 8, T.fieldD - 8, T.cornerRadius - 2);
  const innerPts = innerShape.getPoints(96).map(p => new THREE.Vector3(p.x, 0.15, p.y));
  innerPts.push(innerPts[0].clone());
  const innerGeo = new THREE.BufferGeometry().setFromPoints(innerPts);
  const innerRing = new THREE.Line(innerGeo, new THREE.LineBasicMaterial({
    color: P.innerRing, transparent: true, opacity: 0.6,
  }));
  group.add(innerRing);

  // --- 6. White center line (vertical mid divider) ---
  const midGeo = new THREE.PlaneGeometry(0.5, T.fieldD * 0.96);
  midGeo.rotateX(-Math.PI / 2);
  const midLine = new THREE.Mesh(
    midGeo,
    new THREE.MeshBasicMaterial({ color: P.centerLine, transparent: true, opacity: 0.7 })
  );
  midLine.position.y = 0.18;
  group.add(midLine);

  // --- 7. Iridescent opal accent rings near corners (sparkle anchors) ---
  const accentMat = new THREE.MeshBasicMaterial({
    color: P.opalLight, transparent: true, opacity: 0.35,
  });
  const accentPositions = [
    [-T.fieldW / 2 + 18, -T.fieldD / 2 + 12],
    [-T.fieldW / 2 + 18,  T.fieldD / 2 - 12],
    [ T.fieldW / 2 - 18, -T.fieldD / 2 + 12],
    [ T.fieldW / 2 - 18,  T.fieldD / 2 - 12],
  ];
  accentPositions.forEach(([x, z]) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.0, 32),
      accentMat
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.20, z);
    group.add(ring);
  });

  scene.add(group);
  return { floor, group };
}

// helper: line y = f(x) clipped to rect [xMin..xMax] x [zMin..zMax].
// Returns [{x,z},{x,z}] or null if outside.
function _clipLineToRect(f, xMin, xMax, zMin, zMax) {
  // sample at xMin and xMax, then clamp by z
  const cands = [];
  const z1 = f(xMin), z2 = f(xMax);
  if (z1 >= zMin && z1 <= zMax) cands.push({ x: xMin, z: z1 });
  if (z2 >= zMin && z2 <= zMax) cands.push({ x: xMax, z: z2 });
  // edges where z = zMin or zMax → x = (zMin - c) or similar; we approximate
  // by inverse: solve for x when f(x)=zMin or zMax. f is x+c or -x+c, both linear.
  // We don't know c here; recover from a known sample: c = z1 - xMin (for /) etc.
  // Simpler: numerically find x at zMin and zMax.
  const slope = (z2 - z1) / (xMax - xMin);
  if (Math.abs(slope) > 1e-6) {
    const xAtZmin = xMin + (zMin - z1) / slope;
    const xAtZmax = xMin + (zMax - z1) / slope;
    if (xAtZmin >= xMin && xAtZmin <= xMax) cands.push({ x: xAtZmin, z: zMin });
    if (xAtZmax >= xMin && xAtZmax <= xMax) cands.push({ x: xAtZmax, z: zMax });
  }
  if (cands.length < 2) return null;
  // pick two endpoints (sorted by x)
  cands.sort((a, b) => a.x - b.x);
  return [cands[0], cands[cands.length - 1]];
}
