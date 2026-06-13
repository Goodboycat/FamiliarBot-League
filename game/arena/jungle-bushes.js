/**
 * JUNGLE BUSHES — Low-poly clumps of icosahedra, instanced.
 *
 * Renders all bushes from all clusters in a SINGLE InstancedMesh.
 * Bush positions are sampled in a ring around each cluster center; small
 * random scale + rotation variance is baked into the matrix.
 *
 * Exports: buildJungleBushes(scene) -> { group, count }
 */

function buildJungleBushes(scene) {
  if (typeof TERRAIN === 'undefined') return { group: null, count: 0 };
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'JungleBushes';

  // total bush count (jungleClusters + sideBushes)
  const clusters = [...T.jungleClusters, ...T.sideBushes];
  let total = 0;
  clusters.forEach(c => total += c.bushCount);

  // Low-poly bush: icosahedron, detail 0 = 20 tris
  const bushGeo = new THREE.IcosahedronGeometry(1.0, 0);
  const bushMat = new THREE.MeshStandardMaterial({
    color: P.bushDark, metalness: 0.05, roughness: 0.95,
    emissive: P.bushLight, emissiveIntensity: 0.08,
    flatShading: true,
  });

  const inst = new THREE.InstancedMesh(bushGeo, bushMat, total);
  inst.name = 'BushesInstanced';

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const eul = new THREE.Euler();

  // deterministic pseudo-random for reproducible layout
  let seed = 12345;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let i = 0;
  clusters.forEach(cluster => {
    const [cx, cz] = cluster.pos;
    for (let k = 0; k < cluster.bushCount; k++) {
      const angle = (k / cluster.bushCount) * Math.PI * 2 + rng() * 0.6;
      const r = cluster.radius * (0.55 + rng() * 0.5);
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      const size = 0.8 + rng() * 0.9;
      const y = size * 0.55;

      eul.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      q.setFromEuler(eul);
      p.set(x, y, z);
      s.set(size, size * 0.85, size);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      i++;
    }
  });

  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);
  scene.add(group);

  return { group, count: total };
}

// Bushes are walk-through (no collision) — matches MOBA "brush" semantics.
