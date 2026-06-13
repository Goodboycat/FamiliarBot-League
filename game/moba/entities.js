/**
 * FamiliarBot League — entity factory.
 *
 * No external assets used: all robots / bosses / wild robots are simple
 * colored capsules + boxes ("Roblox-form" silhouettes).
 *
 * Public:
 *   createBotMesh(THREE, accent, opts) -> Group with .body/.head + .accentGlow
 *   createWildRobotMesh(THREE, color)
 *   createBossMesh(THREE, color, opts)
 *   createCaptureCircleMesh(THREE, opts) -> { group, ring, fill, setProgress(0..1), setOwner(team) }
 */
(function (global) {

  function mat(THREE, color, emissive, emissiveIntensity) {
    return new THREE.MeshStandardMaterial({
      color, metalness: 0.55, roughness: 0.45,
      emissive: emissive != null ? emissive : 0x000000,
      emissiveIntensity: emissiveIntensity != null ? emissiveIntensity : 0.4
    });
  }

  // --- A simple "Roblox-form" mech ---------------------------------------
  function createBotMesh(THREE, accent, opts) {
    opts = opts || {};
    const scale  = opts.scale || 1.0;
    const isEnemy = !!opts.isEnemy;

    const group = new THREE.Group();

    // legs (two capsule-like boxes)
    const legGeo = new THREE.BoxGeometry(0.55*scale, 1.4*scale, 0.55*scale);
    const legMat = mat(THREE, accent.body, 0x101820, 0.25);
    const legL = new THREE.Mesh(legGeo, legMat);
    const legR = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.5*scale, 0.7*scale, 0);
    legR.position.set( 0.5*scale, 0.7*scale, 0);
    group.add(legL); group.add(legR);

    // body
    const bodyGeo = new THREE.BoxGeometry(2.0*scale, 1.8*scale, 1.2*scale);
    const bodyMat = mat(THREE, accent.body, 0x10202c, 0.3);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.3*scale;
    group.add(body);

    // arms
    const armGeo = new THREE.BoxGeometry(0.5*scale, 1.6*scale, 0.5*scale);
    const armMat = mat(THREE, accent.body, 0x101820, 0.2);
    const armL = new THREE.Mesh(armGeo, armMat);
    const armR = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-1.4*scale, 2.3*scale, 0);
    armR.position.set( 1.4*scale, 2.3*scale, 0);
    group.add(armL); group.add(armR);

    // head
    const headGeo = new THREE.BoxGeometry(1.2*scale, 1.0*scale, 1.0*scale);
    const headMat = mat(THREE, accent.head, accent.glow, 0.9);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 3.7*scale;
    group.add(head);

    // visor (the bright accent strip)
    const visorGeo = new THREE.BoxGeometry(1.0*scale, 0.18*scale, 0.06*scale);
    const visorMat = new THREE.MeshBasicMaterial({ color: accent.glow });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 3.75*scale, 0.55*scale);
    group.add(visor);

    // chest core glow
    const core = new THREE.PointLight(accent.glow, isEnemy ? 0.8 : 1.0, 8*scale, 1.5);
    core.position.set(0, 2.3*scale, 0.4*scale);
    group.add(core);

    // team ring under feet — readable from top-down
    const ringGeo = new THREE.RingGeometry(1.4*scale, 1.7*scale, 28);
    const ringCol = isEnemy ? 0xff3b55 : 0x3aa3ff;
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringCol, transparent: true, opacity: 0.7, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    // Idle/run animation hooks (set by ai.js / player loop)
    group.userData = {
      legL, legR, armL, armR, body, head, ring,
      animPhase: 0, scale,
      tint(c) { headMat.emissive.setHex(c); visorMat.color.setHex(c); }
    };
    return group;
  }

  // --- A small purple "wild robot" ---------------------------------------
  function createWildRobotMesh(THREE, color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      mat(THREE, color || 0x6a3aa8, 0x6a3aa8, 0.6)
    );
    body.position.y = 1.2;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.8),
      mat(THREE, 0x32184a, 0xa258ff, 0.9)
    );
    head.position.y = 2.4;
    g.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe2ff });
    const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.25, 2.45, 0.45);
    const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set( 0.25, 2.45, 0.45);
    g.add(eL); g.add(eR);
    g.userData = { body, head };
    return g;
  }

  // --- Boss: bigger, with crown ring -------------------------------------
  function createBossMesh(THREE, color, opts) {
    opts = opts || {};
    const scale = opts.scale || 1.6;
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2*scale, 2.4*scale, 2.0*scale),
      mat(THREE, color || 0xff7a2a, color || 0xff7a2a, 0.5)
    );
    body.position.y = 1.5*scale;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.4*scale, 1.0*scale, 1.0*scale),
      mat(THREE, 0x222222, color || 0xff7a2a, 1.0)
    );
    head.position.y = 3.2*scale;
    g.add(head);

    // crown ring (torus) — distinguishes bosses
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(1.4*scale, 0.18*scale, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff066 })
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 4.2*scale;
    g.add(crown);

    const light = new THREE.PointLight(color || 0xff7a2a, 1.4, 16, 2);
    light.position.y = 3.0 * scale;
    g.add(light);

    g.userData = { body, head, crown, scale };
    return g;
  }

  // --- Capture circle: ring + fill + score-progress bar ------------------
  function createCaptureCircleMesh(THREE, opts) {
    opts = opts || {};
    const radius = opts.radius || 5.0;
    const team   = opts.team   || 'neutral';

    const group = new THREE.Group();

    const teamColors = {
      player:  0x3aa3ff,
      enemy:   0xff3b55,
      neutral: 0xfff066
    };
    const color = teamColors[team] || teamColors.neutral;

    // outer ring
    const ringGeo = new THREE.RingGeometry(radius*0.9, radius, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    // fill — represents how much "scoring" the team has dumped into it
    const fillGeo = new THREE.CircleGeometry(radius*0.85, 36);
    const fillMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.25, side: THREE.DoubleSide
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.05;
    group.add(fill);

    // vertical light pillar — read this from top-down
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius*0.15, radius*0.15, 5.0, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.4, side: THREE.DoubleSide
      })
    );
    pillar.position.y = 2.5;
    group.add(pillar);

    group.userData = { ring, fill, pillar, color, team, radius };

    function setProgress(t) {
      const v = Math.max(0, Math.min(1, t));
      fillMat.opacity = 0.25 + v * 0.55;
      pillar.scale.y = 0.6 + v * 1.8;
    }
    function setOwner(newTeam) {
      const c = teamColors[newTeam] || teamColors.neutral;
      ringMat.color.setHex(c);
      fillMat.color.setHex(c);
      pillar.material.color.setHex(c);
      group.userData.color = c;
      group.userData.team = newTeam;
    }
    function destroy(scene) {
      scene.remove(group);
      ringGeo.dispose(); ringMat.dispose();
      fillGeo.dispose(); fillMat.dispose();
      pillar.geometry.dispose(); pillar.material.dispose();
    }
    return { group, ring, fill, pillar, setProgress, setOwner, destroy };
  }

  // --- Massive central boss (final 2 min) --------------------------------
  function createMegaBossMesh(THREE) {
    const g = new THREE.Group();
    const scale = 2.8;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3.2*scale, 3.4*scale, 3.0*scale),
      mat(THREE, 0xaa0033, 0xff5577, 0.9)
    );
    body.position.y = 2.0 * scale;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(2.0*scale, 1.4*scale, 1.6*scale),
      mat(THREE, 0x220011, 0xff2244, 1.2)
    );
    head.position.y = 4.4 * scale;
    g.add(head);

    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(2.0*scale, 0.32*scale, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xfff066 })
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 5.6 * scale;
    g.add(crown);

    const light = new THREE.PointLight(0xff2244, 2.4, 28, 2);
    light.position.y = 4 * scale;
    g.add(light);
    g.userData = { body, head, crown };
    return g;
  }

  global.createBotMesh           = createBotMesh;
  global.createWildRobotMesh     = createWildRobotMesh;
  global.createBossMesh          = createBossMesh;
  global.createMegaBossMesh      = createMegaBossMesh;
  global.createCaptureCircleMesh = createCaptureCircleMesh;
})(typeof window !== 'undefined' ? window : globalThis);
