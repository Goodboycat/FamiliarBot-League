/**
 * CAPTURE POINTS — 10 mirrored goal zones (5 per side).
 * Tier-styled (base = tallest tower, middle = mid tower, outer = low ring).
 * Updates `capturePointMeshes` global used by capture.js / scene.js.
 *
 * Exports: buildCapturePoints(scene) -> { group }
 *          updateCapturePointVisuals(cps)  -- overrides the original
 */

function buildCapturePoints(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'CapturePoints';

  CAPTURE_POINTS.forEach(cp => {
    const g = new THREE.Group();
    const tier = cp.tier || 'middle';
    const sideColor = cp.side === 'player' ? P.teamPlayer : P.teamEnemy;

    // tier dimensions
    const tierProps = {
      outer:  { towerH: 1.4, towerR: 1.0, ringR: cp.captureRadius, padOpacity: 0.45 },
      middle: { towerH: 2.6, towerR: 1.3, ringR: cp.captureRadius, padOpacity: 0.5  },
      base:   { towerH: 4.2, towerR: 1.8, ringR: cp.captureRadius, padOpacity: 0.6  },
    }[tier];

    // 1. Floor pad (large flat disc)
    const padGeo = new THREE.CylinderGeometry(cp.captureRadius, cp.captureRadius, 0.16, 32);
    const padMat = new THREE.MeshBasicMaterial({
      color: sideColor, transparent: true, opacity: tierProps.padOpacity,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.08;
    g.add(pad);

    // 2. Outer ring on the floor
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(cp.captureRadius * 0.92, cp.captureRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.17;
    g.add(outline);

    // 3. Central tower / pylon
    const towerMat = new THREE.MeshStandardMaterial({
      color: sideColor, metalness: 0.55, roughness: 0.35,
      emissive: sideColor, emissiveIntensity: 0.5,
    });
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(tierProps.towerR * 0.7, tierProps.towerR, tierProps.towerH, 12),
      towerMat
    );
    tower.position.y = tierProps.towerH / 2 + 0.16;
    g.add(tower);

    // 4. Glowing crown ring around tower
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(tierProps.towerR * 1.3, 0.18, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = tierProps.towerH + 0.16;
    g.add(crown);

    // 5. Top orb
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(tierProps.towerR * 0.55, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    orb.position.y = tierProps.towerH + 0.55;
    g.add(orb);

    // 6. Point light
    const pl = new THREE.PointLight(sideColor, 1.0, 16);
    pl.position.y = tierProps.towerH + 0.6;
    g.add(pl);

    // 7. (Base tier only) four mini-pillars at cardinals
    if (tier === 'base') {
      const miniMat = new THREE.MeshStandardMaterial({
        color: P.gold, metalness: 0.7, roughness: 0.35,
        emissive: P.gold, emissiveIntensity: 0.15,
      });
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dz]) => {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8),
          miniMat
        );
        m.position.set(dx * cp.captureRadius * 0.75, 0.8, dz * cp.captureRadius * 0.75);
        g.add(m);
      });
    }

    g.position.set(cp.position[0], 0, cp.position[1]);
    g.userData.cpId = cp.id;
    g.userData.collider = { x: cp.position[0], z: cp.position[1], r: tierProps.towerR + 0.4 };
    group.add(g);

    // Register in the global mesh map used by capture.js / scene.js
    capturePointMeshes[cp.id] = {
      group: g, cylinder: pad, ring: crown, light: pl, tower, orb, outline,
    };
  });

  scene.add(group);
  return { group };
}

// Replacement for the original updateCapturePointVisuals in scene.js.
// Updates pad/crown/orb/light/outline to reflect owner + contested + progress.
function updateCapturePointVisualsV2(cps) {
  const P = TERRAIN.palette;
  cps.forEach(cp => {
    const m = capturePointMeshes[cp.id];
    if (!m) return;
    let color;
    if (cp.owner === 'player') color = P.teamPlayer;
    else if (cp.owner === 'enemy') color = P.teamEnemy;
    else color = 0xffffff;
    if (cp._contested) color = 0xffee44;

    m.cylinder.material.color.setHex(color);
    if (m.ring && m.ring.material) m.ring.material.color.setHex(0xffffff);
    if (m.light) m.light.color.setHex(color);
    if (m.tower && m.tower.material) {
      m.tower.material.color.setHex(color);
      if (m.tower.material.emissive) m.tower.material.emissive.setHex(color);
    }
    m.cylinder.material.opacity = 0.35 + Math.abs(cp.captureProgress || 0) * 0.5;
  });
}

// Make this the canonical implementation
if (typeof window !== 'undefined') {
  window.updateCapturePointVisuals = updateCapturePointVisualsV2;
}

// Soft collision (only base towers block movement — middle/outer are walk-through pads)
function collideWithCaptureTowers(pos, radius) {
  CAPTURE_POINTS.forEach(cp => {
    if (cp.tier !== 'base') return;
    const m = capturePointMeshes[cp.id];
    if (!m || !m.group.userData.collider) return;
    const c = m.group.userData.collider;
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
