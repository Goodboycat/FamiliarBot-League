/**
 * PERIMETER WALL — Crenellated stone wall around the rounded-rectangle field.
 *
 * Strategy:
 *   1. A single low-poly rounded-rect "ribbon" (TubeGeometry along a CurvePath)
 *      gives us the wall ring in one mesh.
 *   2. Merlons (the crenellation teeth) are rendered via a SINGLE InstancedMesh
 *      placed at regular arc-length intervals along the ring.
 *
 * Total cost: ~2 draw calls + ~merlonCount × 12 tris.
 *
 * Exports: buildPerimeterWall(scene) -> { group, merlonCount }
 */

function _roundedRectCurvePath(w, d, r) {
  // Build a closed CurvePath made of 4 lines + 4 quadratic corners
  const hw = w / 2, hd = d / 2;
  const path = new THREE.CurvePath();
  const Q = THREE.QuadraticBezierCurve3;
  const L = THREE.LineCurve3;
  const V = (x, z) => new THREE.Vector3(x, 0, z);

  // start at bottom-left straight start
  path.add(new L(V(-hw + r, -hd), V( hw - r, -hd)));
  path.add(new Q(V( hw - r, -hd), V( hw, -hd), V( hw, -hd + r)));
  path.add(new L(V( hw, -hd + r), V( hw,  hd - r)));
  path.add(new Q(V( hw,  hd - r), V( hw,  hd), V( hw - r,  hd)));
  path.add(new L(V( hw - r,  hd), V(-hw + r,  hd)));
  path.add(new Q(V(-hw + r,  hd), V(-hw,  hd), V(-hw,  hd - r)));
  path.add(new L(V(-hw,  hd - r), V(-hw, -hd + r)));
  path.add(new Q(V(-hw, -hd + r), V(-hw, -hd), V(-hw + r, -hd)));
  return path;
}

function buildPerimeterWall(scene) {
  if (typeof TERRAIN === 'undefined') return { group: null, merlonCount: 0 };
  const T = TERRAIN, P = T.palette, Pm = T.perimeter;
  const group = new THREE.Group();
  group.name = 'PerimeterWall';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: P.stoneWall, metalness: 0.2, roughness: 0.85,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: P.stoneCap, metalness: 0.25, roughness: 0.7,
  });

  // 1. Wall slab (rounded ring) via ExtrudeGeometry of a hollow rounded-rect.
  //    We use difference: outer rounded-rect minus inner rounded-rect (shape holes).
  const outerW = T.fieldW + T.goldRim * 2 + Pm.merlonT;
  const outerD = T.fieldD + T.goldRim * 2 + Pm.merlonT;
  const outerR = T.cornerRadius + T.goldRim + Pm.merlonT * 0.5;
  const innerW = T.fieldW + T.goldRim * 2;
  const innerD = T.fieldD + T.goldRim * 2;
  const innerR = T.cornerRadius + T.goldRim;

  const outerShape = window._roundedRectShape
    ? window._roundedRectShape(outerW, outerD, outerR)
    : _localRoundedRect(outerW, outerD, outerR);
  const innerShape = window._roundedRectShape
    ? window._roundedRectShape(innerW, innerD, innerR)
    : _localRoundedRect(innerW, innerD, innerR);
  outerShape.holes.push(innerShape);

  const slabGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: Pm.wallH, bevelEnabled: false, curveSegments: 16,
  });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(0, Pm.wallH, 0);
  const slab = new THREE.Mesh(slabGeo, stoneMat);
  slab.name = 'PerimeterSlab';
  group.add(slab);

  // 2. Merlons (instanced low-poly boxes) along the ring path.
  //    We sample points uniformly along the outer ring curve.
  const ringPath = _roundedRectCurvePath(
    (innerW + outerW) / 2,
    (innerD + outerD) / 2,
    (innerR + outerR) / 2,
  );
  const N = Pm.merlonCount;
  const merlonGeo = new THREE.BoxGeometry(Pm.merlonW, Pm.merlonH, Pm.merlonT);
  const merlons = new THREE.InstancedMesh(merlonGeo, capMat, N);
  merlons.name = 'PerimeterMerlonsInstanced';

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < N; i++) {
    const t = i / N;
    const pt = ringPath.getPointAt(t);
    const tan = ringPath.getTangentAt(t);
    const angle = Math.atan2(tan.x, tan.z); // align merlon long axis with tangent (XZ)
    p.set(pt.x, Pm.wallH + Pm.merlonH / 2, pt.z);
    q.setFromAxisAngle(up, angle);
    m.compose(p, q, s);
    merlons.setMatrixAt(i, m);
  }
  merlons.instanceMatrix.needsUpdate = true;
  group.add(merlons);

  scene.add(group);
  return { group, merlonCount: N };
}

// Fallback rounded-rect builder if floor.js isn't loaded yet
function _localRoundedRect(w, d, r) {
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
