/**
 * PILLARS — Decorative opal columns, instanced.
 *
 * 1 draw call for shafts, 1 for bases, 1 for caps. Collision uses TERRAIN.pillars
 * directly (no per-instance traversal of a group).
 *
 * Exports: buildPillars(scene) -> { group }
 */

function buildPillars(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'Pillars';

  const N = T.pillars.length;
  const pillarH = 4.4;
  const pillarR = 0.8;

  // Shared low-poly geometries (8-segment cylinders, 8-segment sphere)
  const shaftGeo = new THREE.CylinderGeometry(pillarR, pillarR * 1.08, pillarH, 8);
  const baseGeo  = new THREE.CylinderGeometry(pillarR * 1.5, pillarR * 1.7, 0.4, 8);
  const capGeo   = new THREE.SphereGeometry(pillarR * 1.05, 8, 6);

  const shaftMat = new THREE.MeshStandardMaterial({
    color: P.pillar, metalness: 0.4, roughness: 0.4,
    emissive: P.poolGlow, emissiveIntensity: 0.12,
  });
  const baseMat  = new THREE.MeshStandardMaterial({
    color: P.gold, metalness: 0.6, roughness: 0.4,
  });
  const capMat   = new THREE.MeshBasicMaterial({ color: P.pillarCap });

  const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, N);
  const bases  = new THREE.InstancedMesh(baseGeo,  baseMat,  N);
  const caps   = new THREE.InstancedMesh(capGeo,   capMat,   N);
  shafts.name = 'PillarShaftsInstanced';
  bases.name  = 'PillarBasesInstanced';
  caps.name   = 'PillarCapsInstanced';

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);

  T.pillars.forEach(([x, z], i) => {
    p.set(x, 0.2, z);              m.compose(p, q, s); bases.setMatrixAt(i, m);
    p.set(x, 0.4 + pillarH / 2, z); m.compose(p, q, s); shafts.setMatrixAt(i, m);
    p.set(x, 0.4 + pillarH + pillarR * 0.4, z); m.compose(p, q, s); caps.setMatrixAt(i, m);
  });

  shafts.instanceMatrix.needsUpdate = true;
  bases.instanceMatrix.needsUpdate  = true;
  caps.instanceMatrix.needsUpdate   = true;

  group.add(bases); group.add(shafts); group.add(caps);

  // Subtle global point light at center to read pillars without spamming per-pillar lights
  // (mobile-friendly: one light covers the whole arena from above the altar)
  scene.add(group);
  return { group };
}

// Pillar collision uses TERRAIN.pillars directly (no group walk)
function collideWithPillars(pos, radius) {
  if (typeof TERRAIN === 'undefined' || !TERRAIN.pillars) return;
  const pillarR = 0.8;
  TERRAIN.pillars.forEach(([x, z]) => {
    const dx = pos.x - x, dz = pos.z - z;
    const d = Math.hypot(dx, dz);
    const minD = pillarR + 0.4 + radius;
    if (d > 1e-3 && d < minD) {
      const push = (minD - d);
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    }
  });
}
