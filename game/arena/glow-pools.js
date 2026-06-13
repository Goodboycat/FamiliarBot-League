/**
 * GLOW POOLS — Cyan emissive discs under each jungle cluster.
 *
 * Single InstancedMesh of low-poly ring planes, all sharing one emissive
 * material. Provides the bright pool look from the reference image where
 * the central jungle has water/glow under the bushes.
 *
 * Exports: buildGlowPools(scene) -> { group }
 */

function buildGlowPools(scene) {
  if (typeof TERRAIN === 'undefined') return { group: null };
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'GlowPools';

  const clusters = T.jungleClusters; // only the 4 large central pools get glow water
  const N = clusters.length;

  // Disc geometry (circle, 24 segments)
  const discGeo = new THREE.CircleGeometry(1.0, 24);
  discGeo.rotateX(-Math.PI / 2);

  const discMat = new THREE.MeshStandardMaterial({
    color: P.poolDeep, transparent: true, opacity: 0.7,
    emissive: P.poolGlow, emissiveIntensity: 1.0,
    metalness: 0.0, roughness: 0.4, depthWrite: false,
  });

  // Outer halo ring
  const haloGeo = new THREE.RingGeometry(0.95, 1.0, 32);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    color: P.poolGlow, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
  });

  const discs = new THREE.InstancedMesh(discGeo, discMat, N);
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, N);
  discs.name = 'PoolDiscsInstanced';
  halos.name = 'PoolHalosInstanced';

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  clusters.forEach((c, i) => {
    const r = c.radius * 0.7;
    p.set(c.pos[0], 0.04, c.pos[1]);
    s.set(r, 1, r);
    m.compose(p, q, s);
    discs.setMatrixAt(i, m);

    p.set(c.pos[0], 0.08, c.pos[1]);
    s.set(r * 1.05, r * 1.05, 1);
    m.compose(p, q, s);
    halos.setMatrixAt(i, m);
  });

  discs.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  group.add(discs); group.add(halos);
  scene.add(group);
  return { group };
}
