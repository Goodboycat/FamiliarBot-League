/**
 * CAPTURE POINTS — 10 mirrored capture circles (5 per side).
 *
 * Per-tier optimization: pads / outlines / towers / crowns / orbs / lights
 * are batched by InstancedMesh so we stay at ~6 draw calls regardless of
 * point count. The PAD CIRCLES carry the EMISSIVE team color (per user req).
 *
 * Backward-compat: still populates `capturePointMeshes[id]` with
 *   { group, cylinder, ring, light, tower, orb, outline, _instanceIndex }
 * so updateCapturePointVisuals can recolor by tweaking per-instance color.
 *
 * Exports: buildCapturePoints(scene) -> { group }
 *          updateCapturePointVisualsV2(cps)
 *          collideWithCaptureTowers(pos, radius)
 */

function buildCapturePoints(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'CapturePoints';

  const N = CAPTURE_POINTS.length;

  // tier dims (must be uniform per-instance, so we approximate by averaging
  // radius into each instance's scale; tower/orb scale handled per instance)
  const tierProps = {
    outer:  { towerH: 1.6, towerR: 1.0, padOpacity: 0.55 },
    middle: { towerH: 2.8, towerR: 1.3, padOpacity: 0.65 },
    base:   { towerH: 4.4, towerR: 1.8, padOpacity: 0.80 },
  };

  // --- shared geometries (low-poly, all reused via instancing) ---
  const padGeo = new THREE.CylinderGeometry(1, 1, 0.16, 24);              // 48 tris
  const ringGeo = new THREE.RingGeometry(0.92, 1.0, 32);                  // 32 tris
  const towerGeo = new THREE.CylinderGeometry(0.7, 1.0, 1.0, 10);         // 20 tris (unit, scaled per-instance)
  const crownGeo = new THREE.TorusGeometry(1.0, 0.14, 6, 18);             // 108 tris
  const orbGeo   = new THREE.SphereGeometry(1.0, 10, 8);                  // ~80 tris

  // --- materials (emissive on pad + tower as user requested) ---
  const padMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.7,
    emissive: 0xffffff, emissiveIntensity: 1.4, metalness: 0.0, roughness: 0.6,
    vertexColors: false,
  });
  // Allow per-instance color tinting on emissive pads
  padMat.onBeforeCompile = (s) => {
    s.vertexShader = '#define USE_INSTANCING_COLOR\n' + s.vertexShader;
  };

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.55, roughness: 0.3,
    emissive: 0xffffff, emissiveIntensity: 0.55,
  });
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const orbMat   = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // --- instanced meshes ---
  const pads    = new THREE.InstancedMesh(padGeo,   padMat,   N);
  const rings   = new THREE.InstancedMesh(ringGeo,  ringMat,  N);
  const towers  = new THREE.InstancedMesh(towerGeo, towerMat, N);
  const crowns  = new THREE.InstancedMesh(crownGeo, crownMat, N);
  const orbs    = new THREE.InstancedMesh(orbGeo,   orbMat,   N);
  pads.name = 'CP_Pads'; rings.name = 'CP_Rings';
  towers.name = 'CP_Towers'; crowns.name = 'CP_Crowns'; orbs.name = 'CP_Orbs';

  // Per-instance colors so we can recolor on capture
  const padColor = new Float32Array(N * 3);
  const towerColor = new Float32Array(N * 3);
  pads.instanceColor   = new THREE.InstancedBufferAttribute(padColor, 3);
  towers.instanceColor = new THREE.InstancedBufferAttribute(towerColor, 3);

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qRingFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const qCrownFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0),  Math.PI / 2);
  const s = new THREE.Vector3(1, 1, 1);

  // Backward-compat lookup (used by capture.js / scene.js)
  if (typeof window !== 'undefined' && !window.capturePointMeshes) {
    window.capturePointMeshes = {};
  }

  CAPTURE_POINTS.forEach((cp, i) => {
    const tier = cp.tier || 'middle';
    const tp = tierProps[tier];
    const sideColor = cp.side === 'player' ? P.teamPlayer : P.teamEnemy;
    const sideColorObj = new THREE.Color(sideColor);

    const [cx, cz] = cp.position;

    // PAD — cylinder of radius cp.captureRadius
    p.set(cx, 0.10, cz);
    s.set(cp.captureRadius, 1, cp.captureRadius);
    m.compose(p, new THREE.Quaternion(), s);
    pads.setMatrixAt(i, m);
    pads.setColorAt(i, sideColorObj);

    // RING outline (flat on ground)
    p.set(cx, 0.19, cz);
    s.set(cp.captureRadius, cp.captureRadius, 1);
    m.compose(p, qRingFlat, s);
    rings.setMatrixAt(i, m);

    // TOWER (vertical cylinder)
    p.set(cx, tp.towerH / 2 + 0.16, cz);
    s.set(tp.towerR, tp.towerH, tp.towerR);
    m.compose(p, new THREE.Quaternion(), s);
    towers.setMatrixAt(i, m);
    towers.setColorAt(i, sideColorObj);

    // CROWN (torus, axis vertical → rotate to lie flat horizontally)
    p.set(cx, tp.towerH + 0.16, cz);
    s.set(tp.towerR * 1.3, tp.towerR * 1.3, tp.towerR * 1.3);
    m.compose(p, qCrownFlat, s);
    crowns.setMatrixAt(i, m);

    // ORB
    p.set(cx, tp.towerH + 0.55, cz);
    s.set(tp.towerR * 0.55, tp.towerR * 0.55, tp.towerR * 0.55);
    m.compose(p, new THREE.Quaternion(), s);
    orbs.setMatrixAt(i, m);

    // Per-CP point light (only on Base tier — keeps mobile light count low)
    let light = null;
    if (tier === 'base') {
      light = new THREE.PointLight(sideColor, 1.2, 18);
      light.position.set(cx, tp.towerH + 0.8, cz);
      scene.add(light);
    }

    // Back-compat mesh handle for existing capture/scene code
    capturePointMeshes[cp.id] = {
      group: null,
      cylinder: { material: { color: { setHex: (h) => recolorInstance(pads, padColor, i, h) }, opacity: tp.padOpacity } },
      ring:     { material: { color: { setHex: () => {} } } },
      light,
      tower:    { material: {
        color:    { setHex: (h) => recolorInstance(towers, towerColor, i, h) },
        emissive: { setHex: () => {} },
      }},
      orb: null,
      outline: null,
      _instanceIndex: i,
      _tier: tier,
      _tierProps: tp,
      _pos: [cx, cz],
    };
  });

  pads.instanceMatrix.needsUpdate   = true;
  rings.instanceMatrix.needsUpdate  = true;
  towers.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  orbs.instanceMatrix.needsUpdate   = true;
  pads.instanceColor.needsUpdate    = true;
  towers.instanceColor.needsUpdate  = true;

  // pads + tower materials need to declare USE_INSTANCING_COLOR
  // (THREE r128 handles this automatically when instanceColor is set on InstancedMesh)
  group.add(pads); group.add(rings); group.add(towers); group.add(crowns); group.add(orbs);
  scene.add(group);
  return { group };
}

function recolorInstance(instMesh, colorArr, i, hex) {
  const c = new THREE.Color(hex);
  colorArr[i * 3 + 0] = c.r;
  colorArr[i * 3 + 1] = c.g;
  colorArr[i * 3 + 2] = c.b;
  if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
}

// V2 visual updater — recolors emissive pad + tower based on owner / contested.
function updateCapturePointVisualsV2(cps) {
  if (typeof TERRAIN === 'undefined') return;
  const P = TERRAIN.palette;
  cps.forEach(cp => {
    const m = capturePointMeshes[cp.id];
    if (!m) return;
    let color;
    if (cp.owner === 'player') color = P.teamPlayer;
    else if (cp.owner === 'enemy') color = P.teamEnemy;
    else color = 0xffffff;
    if (cp._contested) color = 0xffee44;
    if (m.cylinder?.material?.color?.setHex) m.cylinder.material.color.setHex(color);
    if (m.tower?.material?.color?.setHex)    m.tower.material.color.setHex(color);
    if (m.light) m.light.color.setHex(color);
  });
}

if (typeof window !== 'undefined') {
  window.updateCapturePointVisuals = updateCapturePointVisualsV2;
}

// Base-tier collision (only Base towers physically block movement)
function collideWithCaptureTowers(pos, radius) {
  if (typeof CAPTURE_POINTS === 'undefined') return;
  CAPTURE_POINTS.forEach(cp => {
    if (cp.tier !== 'base') return;
    const [cx, cz] = cp.position;
    const r = 1.8 + 0.4;
    const dx = pos.x - cx, dz = pos.z - cz;
    const d = Math.hypot(dx, dz);
    const minD = r + radius;
    if (d > 1e-3 && d < minD) {
      const push = (minD - d);
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    }
  });
}
