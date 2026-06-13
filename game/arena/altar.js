/**
 * ALTAR — Central neutral "RESTIVAL" objective.
 *
 * Long stone slab centerpiece with a glowing label plane facing up
 * (drawn via a CanvasTexture → 1 extra draw call), flanked by a
 * floating gold core and two rotating rings.
 *
 * Exports: buildAltar(scene) -> { group, update(dt) }
 */

function _makeLabelTexture(text, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // background plate
  g.fillStyle = '#1a1614';
  g.fillRect(0, 0, w, h);
  // gold border
  g.strokeStyle = '#d6b066';
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);
  // text
  g.fillStyle = '#ffe6a8';
  g.font = 'bold 64px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff9c4a';
  g.shadowBlur = 18;
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function buildAltar(scene) {
  const T = TERRAIN, P = T.palette;
  const A = T.altar;
  const group = new THREE.Group();
  group.name = 'CentralAltar';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: P.altarStone, metalness: 0.3, roughness: 0.7,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: P.gold, metalness: 0.75, roughness: 0.3,
    emissive: P.gold, emissiveIntensity: 0.18,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: P.altarCore, transparent: true, opacity: 0.9,
  });

  // Long base slab (width × depth × thin height) — references the central
  // rectangular "RESTIVAL" platform in the top-down image.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(A.radius * 2.2, 0.6, A.radius * 0.9),
    stoneMat,
  );
  slab.position.y = 0.3;
  group.add(slab);

  // Gold trim plate slightly above the slab top
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(A.radius * 2.0, 0.08, A.radius * 0.75),
    goldMat,
  );
  trim.position.y = 0.65;
  group.add(trim);

  // RESTIVAL label plane (face-up, slight tilt so it reads from camera)
  const labelTex = _makeLabelTexture(A.label || 'RESTIVAL');
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(A.radius * 1.8, A.radius * 0.45),
    labelMat,
  );
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.71;
  group.add(label);

  // Floating gold core above the slab
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.0, 1),
    coreMat,
  );
  core.position.y = A.height + 1.6;
  group.add(core);

  // Two thin rotating rings around the core
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.12, 8, 32),
    goldMat,
  );
  ring1.position.y = A.height + 1.6;
  ring1.rotation.x = Math.PI / 2;
  group.add(ring1);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.08, 6, 32),
    new THREE.MeshBasicMaterial({ color: P.poolGlow, transparent: true, opacity: 0.7 }),
  );
  ring2.position.y = A.height + 1.6;
  group.add(ring2);

  // One bright point light at the altar core (only altar light = mobile-friendly)
  const pl = new THREE.PointLight(P.altarCore, 1.6, 30);
  pl.position.y = A.height + 1.6;
  group.add(pl);

  group.position.set(A.pos[0], 0, A.pos[1]);
  group.userData.collider = { x: A.pos[0], z: A.pos[1], r: A.radius * 0.85 };
  scene.add(group);

  let t = 0;
  function update(dt) {
    t += dt;
    core.rotation.y += dt * 0.6;
    core.rotation.x += dt * 0.3;
    core.position.y = A.height + 1.6 + Math.sin(t * 1.4) * 0.18;
    ring1.rotation.z += dt * 0.4;
    ring2.rotation.y += dt * 0.55;
    ring2.rotation.x += dt * 0.2;
  }

  return { group, update };
}

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
