/**
 * PILLARS — Decorative opal columns with glowing white caps.
 *
 * Exports: buildPillars(scene) -> { group }
 */

function buildPillars(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'Pillars';

  const pillarH = 5.0;
  const pillarR = 0.85;

  const shaftMat = new THREE.MeshStandardMaterial({
    color: P.pillar, metalness: 0.5, roughness: 0.35,
    emissive: P.opalDark, emissiveIntensity: 0.25,
  });
  const capMat = new THREE.MeshBasicMaterial({ color: P.pillarCap });
  const baseMat = new THREE.MeshStandardMaterial({
    color: P.gold, metalness: 0.6, roughness: 0.4,
    emissive: P.gold, emissiveIntensity: 0.15,
  });

  T.pillars.forEach(([x, z]) => {
    const p = new THREE.Group();

    // base plinth
    const baseGeo = new THREE.CylinderGeometry(pillarR * 1.5, pillarR * 1.7, 0.4, 12);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    p.add(base);

    // shaft
    const shaftGeo = new THREE.CylinderGeometry(pillarR, pillarR * 1.1, pillarH, 12);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 0.4 + pillarH / 2;
    p.add(shaft);

    // cap (glowing sphere)
    const capGeo = new THREE.SphereGeometry(pillarR * 1.1, 14, 10);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.4 + pillarH + pillarR * 0.4;
    p.add(cap);

    // pulse light
    const pl = new THREE.PointLight(P.opalLight, 0.8, 14);
    pl.position.y = 0.4 + pillarH + pillarR * 0.4;
    p.add(pl);

    p.position.set(x, 0, z);
    p.userData.isPillar = true;
    p.userData.collider = { x, z, r: pillarR + 0.4 };
    group.add(p);
  });

  scene.add(group);
  return { group };
}

// Soft pillar collision (treats each as a circle)
function collideWithPillars(pos, radius) {
  if (!window._pillarGroup) return;
  window._pillarGroup.children.forEach(p => {
    const c = p.userData.collider;
    if (!c) return;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const minD = c.r + radius;
    if (d > 1e-3 && d < minD) {
      const push = (minD - d);
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    }
  });
}
