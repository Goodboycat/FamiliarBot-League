/**
 * ALTAR — Central neutral structure (objective anchor).
 * Tiered cylindrical platform with a floating opal core and rotating ring.
 *
 * Exports: buildAltar(scene) -> { group, update(dt) }
 */

function buildAltar(scene) {
  const T = TERRAIN, P = T.palette;
  const A = T.altar;
  const group = new THREE.Group();
  group.name = 'CentralAltar';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: P.groundLane, metalness: 0.3, roughness: 0.65,
    emissive: P.opalDark, emissiveIntensity: 0.08,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: P.gold, metalness: 0.7, roughness: 0.35,
    emissive: P.gold, emissiveIntensity: 0.2,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: P.altarCore, transparent: true, opacity: 0.85,
  });

  // tier 1 (outer)
  const t1 = new THREE.Mesh(
    new THREE.CylinderGeometry(A.radius, A.radius * 1.1, 0.5, 36),
    stoneMat
  );
  t1.position.y = 0.25;
  group.add(t1);

  // tier 2 (mid)
  const t2 = new THREE.Mesh(
    new THREE.CylinderGeometry(A.radius * 0.7, A.radius * 0.8, 0.55, 36),
    stoneMat
  );
  t2.position.y = 0.5 + 0.275;
  group.add(t2);

  // tier 3 (gold inner)
  const t3 = new THREE.Mesh(
    new THREE.CylinderGeometry(A.radius * 0.4, A.radius * 0.45, 0.4, 28),
    goldMat
  );
  t3.position.y = 0.5 + 0.55 + 0.2;
  group.add(t3);

  // floating opal core
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 1),
    coreMat
  );
  core.position.y = A.height + 1.0;
  group.add(core);

  // rotating gold ring around core
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.18, 10, 48),
    goldMat
  );
  ring.position.y = A.height + 1.0;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // second ring (perpendicular)
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.12, 8, 48),
    new THREE.MeshBasicMaterial({ color: P.opalLight, transparent: true, opacity: 0.7 })
  );
  ring2.position.y = A.height + 1.0;
  group.add(ring2);

  // bright point light
  const pl = new THREE.PointLight(P.altarCore, 1.6, 28);
  pl.position.y = A.height + 1.0;
  group.add(pl);

  group.position.set(A.pos[0], 0, A.pos[1]);
  group.userData.collider = { x: A.pos[0], z: A.pos[1], r: A.radius * 0.95 };
  scene.add(group);

  let t = 0;
  function update(dt) {
    t += dt;
    core.rotation.y += dt * 0.6;
    core.rotation.x += dt * 0.3;
    core.position.y = A.height + 1.0 + Math.sin(t * 1.4) * 0.18;
    ring.rotation.z += dt * 0.4;
    ring2.rotation.y += dt * 0.55;
    ring2.rotation.x += dt * 0.2;
  }

  return { group, update };
}

// Altar acts as a hard circular obstacle
function collideWithAltar(pos, radius) {
  if (!window._altarGroup) return;
  const c = window._altarGroup.userData.collider;
  if (!c) return;
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const d = Math.hypot(dx, dz);
  const minD = c.r + radius;
  if (d > 1e-3 && d < minD) {
    const push = (minD - d);
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
  }
}
