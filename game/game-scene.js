/**
 * FamiliarBot League — Three.js scene + player input + render loop.
 *
 * Exposes:
 *   window.startMobaThreeScene(canvas, ctx, hud) -> { dispose, world }
 *
 * Builds the renderer / camera / lights, calls buildTerrain() to set up the
 * GLB-based opal battlefield + capture point overlays, then creates the
 * MOBA world via createMobaWorld() and wires the player's HUD controls to
 * the world systems. The per-frame tick handles:
 *   • player movement & arena clamping
 *   • auto-capture when standing on a circle
 *   • basic / power / unite / eject inputs
 *   • camera follow
 *   • HUD updates (timer, level, cooldowns, portraits, minimap)
 */
(function (global) {

  function startMobaThreeScene(canvas, ctx, hudHandle) {
    const THREE = global.THREE;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(global.devicePixelRatio || 1);
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07101c);
    scene.fog = new THREE.FogExp2(0x07101c, 0.008);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 800);
    camera.position.set(0, 80, 90);
    camera.lookAt(0, 0, 0);

    // Lights (the opal-battlefield module adds its own hemi + sun too;
    // these are kept for the brief window before the GLB resolves).
    scene.add(new THREE.AmbientLight(0x88aacc, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(60, 100, 40);
    scene.add(dir);

    // Build the arena (GLB battlefield + capture pad + spawn pad overlays).
    try {
      if (typeof global.buildTerrain === 'function') global.buildTerrain(scene);
    } catch (err) {
      console.warn("[Game] buildTerrain failed:", err);
      const planeGeo = new THREE.PlaneGeometry(180, 100);
      const planeMat = new THREE.MeshStandardMaterial({ color: 0x4a4a44 });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);
    }

    // VFX pool
    const vfx = global.createVfxSystem(scene);

    // MOBA world
    const world = global.createMobaWorld(scene, vfx, hudHandle, ctx);

    // -------------------- PLAYER INPUT WIRING ---------------------------
    const player = world.player;

    hudHandle.controls.onAbility = (id) => {
      if (!player.alive) return;
      if (id === 'basic') {
        const enemies = world.enemyBots.concat(world.wildRobots, world.bosses);
        if (world.megaBoss) enemies.push(world.megaBoss);
        let best = null, bd = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dd = (e.x - player.x) * (e.x - player.x) + (e.z - player.z) * (e.z - player.z);
          if (dd < bd) { bd = dd; best = e; }
        }
        if (best && bd < 18 * 18) world.fireBasicAttack(player, best);
      } else if (id === 'p1' || id === 'p2') {
        const idx = id === 'p1' ? 0 : 1;
        const slot = player.powers[idx];
        if (slot) world.castPower(player, slot);
      } else if (id === 'unite') {
        if (player.unite.ready) {
          world.castPower(player, { def: player.unite.def, cd: 0 });
          player.unite.cd = player.unite.def.cooldown;
        }
      } else if (id === 'eject') {
        // Eject Button — score on the nearest contested enemy circle
        if (world.ejectStock == null) world.ejectStock = 12;
        if (world.ejectMax == null)   world.ejectMax   = 30;
        if (world.ejectStock > 0) {
          let best = null, bd = Infinity;
          for (const cp of world.capturePoints) {
            if (!cp.alive) continue;
            if (cp.owner === 'player') continue;
            const dd = (cp.x - player.x) * (cp.x - player.x) + (cp.z - player.z) * (cp.z - player.z);
            if (dd < bd) { bd = dd; best = cp; }
          }
          if (best && bd < 14 * 14) {
            for (let i = 0; i < 6; i++) world.captureProgress(best, player, 0.18);
            player.stats.scored += 6;
            vfx.burst({
              type: 'capture',
              pos: new THREE.Vector3(best.x, 0.5, best.z),
              color: 0x39f5ff, scale: 2, count: 100
            });
            world.ejectStock = Math.max(0, world.ejectStock - 6);
            hudHandle.setEject(world.ejectStock, world.ejectMax);
          } else {
            hudHandle.showBanner('System', 'Get inside a contested circle to score!');
          }
        } else {
          hudHandle.showBanner('System', 'Eject Button empty!');
        }
      }
    };

    hudHandle.controls.onSignal = (sig) => {
      const msgs = {
        help:   'Need backup!',
        defend: 'Defending our goal zone!',
        attack: 'Attack this position!',
        chat:   'Good luck team!'
      };
      hudHandle.showBanner(player.name, msgs[sig] || sig);
    };
    hudHandle.controls.onRecall = () => {
      if (!player.alive) return;
      player.x = player.spawn.x;
      player.z = player.spawn.z;
      vfx.burst({ type: 'unite', pos: new THREE.Vector3(player.x, 1, player.z), color: 0x39f5ff, scale: 1.2 });
      player.hp = player.maxHp;
      hudHandle.showBanner(player.name, 'Returning to base...');
    };
    hudHandle.controls.onMenu = () => {
      if (typeof ctx.onHome === 'function') ctx.onHome();
    };
    hudHandle.controls.onSettings = () => {
      if (global.FamiliarBotAudio) {
        const muted = global.FamiliarBotAudio.toggleMute();
        hudHandle.showBanner('System', muted ? 'Audio muted' : 'Audio on');
      }
    };

    // -------------------- LOOP ------------------------------------------
    let stopped = false;
    let lastTs = performance.now();
    let fpsTimer = 0, fpsCount = 0, fpsValue = 60;

    function tick(now) {
      if (stopped) return;
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      fpsTimer += dt; fpsCount++;
      if (fpsTimer >= 0.5) {
        fpsValue = fpsCount / fpsTimer;
        fpsCount = 0; fpsTimer = 0;
        hudHandle.setFps(fpsValue);
      }

      // ---- player input
      if (player.alive) {
        const mv = hudHandle.getMoveVector();
        const sp = player.speed;
        player.x += mv.x * sp * dt;
        player.z += mv.y * sp * dt;
        // clamp to arena
        player.x = Math.max(-86, Math.min(86, player.x));
        player.z = Math.max(-44, Math.min(44, player.z));
        if (mv.x || mv.y) player.facing = Math.atan2(mv.y, mv.x);

        // Auto-score when standing in any capture circle
        for (const cp of world.capturePoints) {
          if (!cp.alive) continue;
          const dd = (cp.x - player.x) * (cp.x - player.x) + (cp.z - player.z) * (cp.z - player.z);
          if (dd < cp.radius * cp.radius) {
            world.captureProgress(cp, player, dt * 0.22);
          }
        }
      } else {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) world.respawnBot(player);
      }

      // pose player mesh
      if (player.mesh && player.alive) {
        player.mesh.position.set(player.x, 0, player.z);
        player.mesh.rotation.y = -player.facing;
        player.mesh.userData.animPhase = (player.mesh.userData.animPhase || 0) + dt * 10;
        player.mesh.position.y = Math.sin(player.mesh.userData.animPhase) * 0.08;
      }

      // ---- world tick
      world.update(dt);

      // ---- VFX
      vfx.update(dt);

      // ---- camera follow (top-down with offset)
      camera.position.x = player.x;
      camera.position.z = player.z + 55;
      camera.position.y = 65;
      camera.lookAt(player.x, 0, player.z);

      // ---- HUD updates
      const secLeft = Math.max(0, world.durationSec - world.time);
      hudHandle.setTimer(secLeft);
      const xpNeed = global.MOBA_CONFIG.xpPerLevel(player.level);
      hudHandle.setLevel(player.level, Math.max(0, Math.min(1, player.xp / xpNeed)));

      // ability cooldowns
      for (let i = 0; i < 2; i++) {
        const s = player.powers[i];
        const slotName = i === 0 ? 'p1' : 'p2';
        if (s) {
          hudHandle.setAbilityIcon(slotName, s.def);
          hudHandle.setAbilityCooldown(slotName, 1 - (s.cd / (s.def.cooldown || 1)));
          hudHandle.setAbilityLevel(slotName, s.level || 1);
        } else {
          hudHandle.setAbilityCooldown(slotName, 0);
        }
      }
      hudHandle.setUniteReady(player.unite.ready);
      hudHandle.setAbilityCooldown('unite', 1 - (player.unite.cd / player.unite.def.cooldown));

      // portraits — team mate hp
      for (let i = 0; i < 4; i++) {
        const a = world.allyBots[i];
        if (a) {
          hudHandle.setPortraitHp('ally', i, a.hp / a.maxHp);
          hudHandle.setPortraitDead('ally', i, !a.alive);
        }
        const e = world.enemyBots[i];
        if (e) {
          hudHandle.setPortraitHp('enemy', i, e.hp / e.maxHp);
          hudHandle.setPortraitDead('enemy', i, !e.alive);
        }
      }

      hudHandle.drawMinimap(world);

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function dispose() {
      stopped = true;
      try { renderer.dispose(); } catch (_e) {}
    }
    return { dispose, world };
  }

  global.startMobaThreeScene = startMobaThreeScene;
})(typeof window !== 'undefined' ? window : globalThis);
