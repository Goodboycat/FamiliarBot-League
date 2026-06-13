/**
 * FamiliarBot League — VFX particle emitter.
 *
 * Single low-poly particle pool (Points + custom shader-less sprite logic).
 * Big, screen-visible bursts as required by the spec: sizes are deliberately
 * generous so the effect reads on a 844x390 stage.
 *
 *   const vfx = createVfxSystem(scene);
 *   vfx.burst({ type:'nova', pos, color:0x39f5ff, scale:1.5 });
 *   vfx.update(dt);
 */
(function (global) {
  const TWO_PI = Math.PI * 2;

  function createVfxSystem(scene) {
    const THREE = global.THREE;
    if (!THREE) return { burst(){}, update(){} , beam(){} };

    const POOL_SIZE = 800;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(POOL_SIZE * 3);
    const colors    = new Float32Array(POOL_SIZE * 3);
    const sizes     = new Float32Array(POOL_SIZE);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
    geom.setAttribute('size',     new THREE.BufferAttribute(sizes,     1));

    const mat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    points.renderOrder = 999;
    scene.add(points);

    // Live particles: { x,y,z, vx,vy,vz, life, ttl, r,g,b, size, drag }
    const particles = [];

    // Persistent beam meshes (line geometry) live separately so they read big.
    const beams = []; // { mesh, ttl, life }

    function pushParticle(p) {
      particles.push(p);
      if (particles.length > POOL_SIZE) particles.shift();
    }

    function colorRGB(hex) {
      const c = new THREE.Color(hex);
      return [c.r, c.g, c.b];
    }

    function burst(opts) {
      const type   = opts.type   || 'nova';
      const pos    = opts.pos    || new THREE.Vector3();
      const color  = opts.color  != null ? opts.color : 0xffffff;
      const scale  = opts.scale  || 1.0;
      const count  = Math.floor((opts.count || 60) * scale);
      const [r,g,b] = colorRGB(color);

      switch (type) {
        case 'beam': {
          // Line + sparkle cloud along the beam.
          const dir = opts.dir || new THREE.Vector3(1, 0, 0);
          const len = (opts.range || 18) * scale;
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            pos.clone(),
            pos.clone().add(dir.clone().multiplyScalar(len))
          ]);
          const lineMat = new THREE.LineBasicMaterial({
            color, transparent: true, opacity: 0.9, linewidth: 4
          });
          const line = new THREE.Line(lineGeo, lineMat);
          line.renderOrder = 1000;
          scene.add(line);
          beams.push({ mesh: line, ttl: 0.35, life: 0.35 });

          for (let i = 0; i < count; i++) {
            const t = Math.random();
            const px = pos.x + dir.x * len * t;
            const pz = pos.z + dir.z * len * t;
            pushParticle({
              x: px, y: 1.5 + Math.random()*2, z: pz,
              vx: (Math.random()-0.5)*4,
              vy: 2 + Math.random()*3,
              vz: (Math.random()-0.5)*4,
              life: 0.6, ttl: 0.6, r,g,b, size: 2 + Math.random()*2*scale, drag: 0.92
            });
          }
          break;
        }
        case 'ring':
        case 'nova': {
          for (let i = 0; i < count; i++) {
            const a = (i/count) * TWO_PI;
            const speed = 8 + Math.random()*4 * scale;
            pushParticle({
              x: pos.x, y: 1.5, z: pos.z,
              vx: Math.cos(a) * speed,
              vy: 1.0 + Math.random()*1.5,
              vz: Math.sin(a) * speed,
              life: 0.8, ttl: 0.8, r,g,b, size: 3*scale, drag: 0.88
            });
          }
          break;
        }
        case 'cone': {
          const dir = opts.dir || new THREE.Vector3(1, 0, 0);
          const base = Math.atan2(dir.z, dir.x);
          for (let i = 0; i < count; i++) {
            const a = base + (Math.random() - 0.5) * 0.9;
            const speed = 10 + Math.random()*6 * scale;
            pushParticle({
              x: pos.x, y: 1.5, z: pos.z,
              vx: Math.cos(a) * speed,
              vy: Math.random()*2,
              vz: Math.sin(a) * speed,
              life: 0.7, ttl: 0.7, r,g,b, size: 3.5*scale, drag: 0.9
            });
          }
          break;
        }
        case 'dash': {
          const dir = opts.dir || new THREE.Vector3(1, 0, 0);
          for (let i = 0; i < count; i++) {
            pushParticle({
              x: pos.x, y: 1.2 + Math.random()*1.5, z: pos.z,
              vx: -dir.x * (4+Math.random()*3) + (Math.random()-0.5)*2,
              vy: Math.random()*1.5,
              vz: -dir.z * (4+Math.random()*3) + (Math.random()-0.5)*2,
              life: 0.5, ttl: 0.5, r,g,b, size: 2.5*scale, drag: 0.85
            });
          }
          break;
        }
        case 'heal': {
          for (let i = 0; i < count; i++) {
            const a = Math.random() * TWO_PI;
            const rad = Math.random() * 5 * scale;
            pushParticle({
              x: pos.x + Math.cos(a)*rad, y: 0.5, z: pos.z + Math.sin(a)*rad,
              vx: 0, vy: 4 + Math.random()*2, vz: 0,
              life: 1.2, ttl: 1.2, r,g,b, size: 3*scale, drag: 1.0
            });
          }
          break;
        }
        case 'shield': {
          for (let i = 0; i < count; i++) {
            const a = (i/count) * TWO_PI;
            pushParticle({
              x: pos.x + Math.cos(a)*3.5, y: 1.5 + Math.random()*2, z: pos.z + Math.sin(a)*3.5,
              vx: 0, vy: 0, vz: 0,
              life: 0.9, ttl: 0.9, r,g,b, size: 3.5*scale, drag: 1.0
            });
          }
          break;
        }
        case 'slam': {
          for (let i = 0; i < count*1.4; i++) {
            const a = Math.random() * TWO_PI;
            const speed = 10 + Math.random()*8 * scale;
            pushParticle({
              x: pos.x, y: 0.5, z: pos.z,
              vx: Math.cos(a) * speed,
              vy: 3 + Math.random()*3,
              vz: Math.sin(a) * speed,
              life: 0.9, ttl: 0.9, r,g,b, size: 4*scale, drag: 0.86
            });
          }
          break;
        }
        case 'unite': {
          // Massive screen-readable burst.
          for (let i = 0; i < count*2.5; i++) {
            const a = Math.random() * TWO_PI;
            const phi = Math.random() * Math.PI;
            const speed = 14 + Math.random()*12 * scale;
            pushParticle({
              x: pos.x, y: 2.0, z: pos.z,
              vx: Math.cos(a) * Math.sin(phi) * speed,
              vy: Math.cos(phi) * speed * 0.6 + 3,
              vz: Math.sin(a) * Math.sin(phi) * speed,
              life: 1.3, ttl: 1.3, r,g,b, size: 5*scale, drag: 0.9
            });
          }
          break;
        }
        case 'level_up': {
          for (let i = 0; i < count; i++) {
            const a = (i/count) * TWO_PI;
            pushParticle({
              x: pos.x + Math.cos(a)*1.2, y: 0.5, z: pos.z + Math.sin(a)*1.2,
              vx: Math.cos(a)*1.5, vy: 6 + Math.random()*3, vz: Math.sin(a)*1.5,
              life: 1.5, ttl: 1.5, r,g,b, size: 4*scale, drag: 0.95
            });
          }
          break;
        }
        case 'capture': {
          for (let i = 0; i < count; i++) {
            const a = Math.random() * TWO_PI;
            const rad = Math.random() * 6 * scale;
            pushParticle({
              x: pos.x + Math.cos(a)*rad, y: 0.3, z: pos.z + Math.sin(a)*rad,
              vx: 0, vy: 5 + Math.random()*4, vz: 0,
              life: 1.1, ttl: 1.1, r,g,b, size: 3.5*scale, drag: 1.0
            });
          }
          break;
        }
        case 'death': {
          for (let i = 0; i < count*1.2; i++) {
            const a = Math.random() * TWO_PI;
            const speed = 5 + Math.random()*6 * scale;
            pushParticle({
              x: pos.x, y: 1.0, z: pos.z,
              vx: Math.cos(a) * speed,
              vy: 3 + Math.random()*4,
              vz: Math.sin(a) * speed,
              life: 1.0, ttl: 1.0, r,g,b, size: 3*scale, drag: 0.9
            });
          }
          break;
        }
        default: {
          for (let i = 0; i < count; i++) {
            const a = Math.random() * TWO_PI;
            pushParticle({
              x: pos.x, y: 1.5, z: pos.z,
              vx: Math.cos(a)*8, vy: 4, vz: Math.sin(a)*8,
              life: 0.7, ttl: 0.7, r,g,b, size: 3, drag: 0.88
            });
          }
        }
      }
    }

    function update(dt) {
      // Beams
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.ttl -= dt;
        if (b.ttl <= 0) {
          scene.remove(b.mesh);
          if (b.mesh.geometry) b.mesh.geometry.dispose();
          if (b.mesh.material) b.mesh.material.dispose();
          beams.splice(i, 1);
        } else {
          b.mesh.material.opacity = (b.ttl / b.life) * 0.9;
        }
      }

      // Particles
      const posAttr = geom.getAttribute('position');
      const colAttr = geom.getAttribute('color');
      const sizAttr = geom.getAttribute('size');
      const n = Math.min(POOL_SIZE, particles.length);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vx *= p.drag;
        p.vz *= p.drag;
        p.vy -= 4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }

      // Repack visible particles (the array is small so this is cheap)
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        if (!p) {
          positions[i*3]=positions[i*3+1]=positions[i*3+2]=0;
          sizes[i] = 0;
          continue;
        }
        positions[i*3]   = p.x;
        positions[i*3+1] = p.y;
        positions[i*3+2] = p.z;
        const t = Math.max(0, p.life / p.ttl);
        colors[i*3]   = p.r * t;
        colors[i*3+1] = p.g * t;
        colors[i*3+2] = p.b * t;
        sizes[i] = p.size * t;
      }
      // Hide unused slots
      for (let i = particles.length; i < POOL_SIZE; i++) {
        positions[i*3]=positions[i*3+1]=positions[i*3+2]=0;
        sizes[i] = 0;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizAttr.needsUpdate = true;
    }

    function dispose() {
      scene.remove(points);
      geom.dispose();
      mat.dispose();
      for (const b of beams) {
        scene.remove(b.mesh);
        if (b.mesh.geometry) b.mesh.geometry.dispose();
        if (b.mesh.material) b.mesh.material.dispose();
      }
      beams.length = 0;
      particles.length = 0;
    }

    return { burst, update, dispose };
  }

  global.createVfxSystem = createVfxSystem;
})(typeof window !== 'undefined' ? window : globalThis);
