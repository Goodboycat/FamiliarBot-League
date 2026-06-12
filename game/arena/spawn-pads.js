/**
 * SPAWN PADS — Team spawn platforms behind each base.
 * Hexagonal team-colored pad with a vertical light beam.
 *
 * Exports: buildSpawnPads(scene) -> { group, getSpawn(side), update(dt) }
 */

function buildSpawnPads(scene) {
  const T = TERRAIN, P = T.palette;
  const group = new THREE.Group();
  group.name = 'SpawnPads';

  const sides = [
    { key: 'player', cfg: T.spawns.player, color: P.teamPlayer },
    { key: 'enemy',  cfg: T.spawns.enemy,  color: P.teamEnemy  },
  ];

  const beams = [];

  sides.forEach(({ key, cfg, color }) => {
    const pad = new THREE.Group();

    // hexagonal pad
    const padGeo = new THREE.CylinderGeometry(cfg.radius, cfg.radius * 1.05, 0.3, 6);
    const padMat = new THREE.MeshStandardMaterial({
      color: color, metalness: 0.6, roughness: 0.35,
      emissive: color, emissiveIntensity: 0.55,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = 0.15;
    padMesh.rotation.y = Math.PI / 6;
    pad.add(padMesh);

    // inner glow ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(cfg.radius * 0.6, cfg.radius * 0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.31;
    pad.add(ring);

    // vertical beam
    const beamGeo = new THREE.CylinderGeometry(cfg.radius * 0.35, cfg.radius * 0.55, 16, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 8;
    pad.add(beam);
    beams.push(beam);

    // bright light
    const pl = new THREE.PointLight(color, 1.4, 22);
    pl.position.y = 4;
    pad.add(pl);

    pad.position.set(cfg.pos[0], 0, cfg.pos[1]);
    pad.userData.side = key;
    group.add(pad);
  });

  scene.add(group);

  let t = 0;
  function update(dt) {
    t += dt;
    beams.forEach((b, i) => {
      b.material.opacity = 0.18 + 0.08 * Math.sin(t * 1.6 + i * Math.PI);
      b.rotation.y += dt * 0.4 * (i === 0 ? 1 : -1);
    });
  }

  function getSpawn(side) {
    const s = side === 'player' ? T.spawns.player : T.spawns.enemy;
    // small jitter so multiple bots don't overlap
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (s.radius * 0.6);
    return new THREE.Vector3(s.pos[0] + Math.cos(a) * r, 0, s.pos[1] + Math.sin(a) * r);
  }

  return { group, getSpawn, update };
}
