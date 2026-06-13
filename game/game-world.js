/**
 * FamiliarBot League — MOBA world factory.
 *
 * Exposes:
 *   window.createMobaWorld(scene, vfx, hud, ctx) -> world
 *
 * `world` carries all gameplay state for one match: actors (player, allies,
 * enemies, wild robots, bosses, mega-boss), capture points, scores, and the
 * combat/capture/XP/respawn systems. `world.update(dt)` advances the sim
 * each frame; the per-frame player input + camera + HUD work is done by the
 * thin scene wrapper in game-scene.js.
 *
 * The module depends on these globals (loaded ahead of it via game-screen.js):
 *   THREE, TERRAIN, MOBA_CONFIG, MOBA_POWERS, MOBA_UNITE, MOBA_BOTS, MOBA_BUFFS,
 *   MOBA_AI, createBotMesh, createWildRobotMesh, createBossMesh,
 *   createMegaBossMesh, createCaptureCircleMesh, pickMobaRosterFor,
 *   MOBA_FALLBACK_NAMES.
 */
(function (global) {

  function createMobaWorld(scene, vfx, hud, ctx) {
    const THREE = global.THREE;
    const CFG    = global.MOBA_CONFIG;
    const POWERS = global.MOBA_POWERS;
    const UNITE  = global.MOBA_UNITE;
    const FALLBACK_NAMES = global.MOBA_FALLBACK_NAMES || ['Nova'];

    const TERRAIN_CP = (global.TERRAIN && global.TERRAIN.capturePoints) || [];

    const world = {
      time: 0,
      durationSec: CFG.matchDurationSec,
      over: false,
      winner: null,                     // 'player' | 'enemy' | 'draw'

      // entities
      player: null,
      allyBots: [],
      enemyBots: [],
      wildRobots: [],
      bosses: [],
      megaBoss: null,
      capturePoints: [],

      // spawn timers
      nextWildSpawn: CFG.wildRobotInitial,
      nextSideBoss:  CFG.sideBossInitial,
      mbSpawned: false,

      // scores
      score: { player: 0, enemy: 0 }
    };

    // ---------------------------------------------------------- factories
    function makeStats() {
      return { scored: 0, kills: 0, deaths: 0, assists: 0, dmg: 0, dmgTaken: 0, heal: 0 };
    }

    function newActor(opts) {
      return {
        kind: opts.kind || 'bot',
        id: opts.id,
        team: opts.team,
        botId: opts.botId,
        name: opts.name,
        role: opts.role,
        x: opts.x, y: 0, z: opts.z,
        facing: opts.team === 'enemy' ? Math.PI : 0,
        speed: opts.speed != null ? opts.speed : 14,
        baseSpeed: opts.speed != null ? opts.speed : 14,
        hp: opts.hp || 100,
        maxHp: opts.hp || 100,
        attack: opts.attack || 12,
        baseAttack: opts.attack || 12,
        shield: 0,
        alive: true,
        level: 1, xp: 0,
        basicCd: 0, powerCd: 0,
        powers: [],
        unite: { def: UNITE, cd: 0, ready: false },
        buffs: [],
        respawnTimer: 0,
        spawn: { x: opts.x, z: opts.z },
        targetCp: null,
        mesh: null,
        stats: makeStats()
      };
    }

    function placeMesh(actor, mesh) {
      mesh.position.set(actor.x, 0, actor.z);
      scene.add(mesh);
      actor.mesh = mesh;
    }

    function buildPlayer() {
      const botId = ctx.botId;
      const accent = (global.MOBA_BOTS && global.MOBA_BOTS[botId]) ||
        { body: 0x4a87b8, head: 0x5fa8d8, glow: 0x39f5ff, role: 'All-Rounder' };
      const p = newActor({
        kind: 'player', id: 'player', team: 'player',
        botId, name: ctx.displayName, role: ctx.role || accent.role,
        x: -74, z: 0, hp: 220, attack: 22, speed: 18
      });
      placeMesh(p, global.createBotMesh(THREE, accent, { scale: 1.1, isEnemy: false }));
      const first = POWERS[Math.floor(Math.random() * POWERS.length)];
      p.powers.push({ slot: 'p1', def: first, cd: 0, level: 1 });
      world.player = p;
      return p;
    }

    function buildTeamBots(team) {
      const arr = [];
      const ids = global.pickMobaRosterFor(team, ctx.botId, 4);
      for (let i = 0; i < 4; i++) {
        const accent = global.MOBA_BOTS[ids[i]] ||
          { body: 0x444, head: 0x666, glow: 0xffffff, role: 'Bot' };
        const name = FALLBACK_NAMES[(Math.floor(Math.random() * FALLBACK_NAMES.length) + i) % FALLBACK_NAMES.length];
        const spawn = team === 'player'
          ? { x: -72 + (i - 2) * 3, z: -12 + i * 7 }
          : { x:  72 + (i - 2) * 3, z: -12 + i * 7 };
        const a = newActor({
          kind: 'bot', id: `${team}-${i}`,
          team, botId: ids[i], name, role: accent.role,
          x: spawn.x, z: spawn.z,
          hp: 180, attack: 16, speed: 14 + Math.random() * 3
        });
        const p1 = POWERS[Math.floor(Math.random() * POWERS.length)];
        a.powers.push({ slot: 'p1', def: p1, cd: 0, level: 1 });
        if (Math.random() > 0.4) {
          let p2;
          do { p2 = POWERS[Math.floor(Math.random() * POWERS.length)]; }
          while (p2.id === p1.id);
          a.powers.push({ slot: 'p2', def: p2, cd: 0, level: 1 });
        }
        placeMesh(a, global.createBotMesh(THREE, accent, { scale: 1.0, isEnemy: team === 'enemy' }));
        arr.push(a);
      }
      return arr;
    }

    function buildCapturePoints() {
      const out = [];
      for (const def of TERRAIN_CP) {
        const team = def.side;
        const cc = global.createCaptureCircleMesh(THREE, {
          radius: def.radius, team
        });
        const x = def.pos[0], z = def.pos[1];
        cc.group.position.set(x, 0, z);
        scene.add(cc.group);
        out.push({
          id: def.id, side: def.side,
          x, z, radius: def.radius,
          owner: team,
          alive: true,
          progress: 1.0,
          mesh: cc
        });
      }
      return out;
    }

    function spawnWildRobot() {
      const jc = (global.TERRAIN && global.TERRAIN.jungleClusters) || [
        { pos: [-14, -16] }, { pos: [-14, 16] }, { pos: [14, -16] }, { pos: [14, 16] }
      ];
      const c = jc[Math.floor(Math.random() * jc.length)];
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 3;
      const x = c.pos[0] + Math.cos(a) * r;
      const z = c.pos[1] + Math.sin(a) * r;
      const w = newActor({
        kind: 'wild', team: 'neutral',
        name: 'Wild Robot',
        x, z, hp: 60, attack: 8, speed: 6
      });
      w.homeX = c.pos[0]; w.homeZ = c.pos[1];
      placeMesh(w, global.createWildRobotMesh(THREE, 0x6a3aa8));
      world.wildRobots.push(w);
    }

    function spawnSideBoss() {
      const slots = [{ x: 0, z: -36 }, { x: 0, z: 36 }];
      for (const s of slots) {
        const b = newActor({
          kind: 'boss', team: 'neutral',
          name: 'Wild Boss',
          x: s.x, z: s.z, hp: 360, attack: 14, speed: 5
        });
        b.buff = pickRandomBuff();
        placeMesh(b, global.createBossMesh(THREE, 0xff7a2a, { scale: 1.4 }));
        world.bosses.push(b);
      }
    }

    function pickRandomBuff() {
      const buffs = Object.values(global.MOBA_BUFFS || {});
      return buffs[Math.floor(Math.random() * buffs.length)] || null;
    }

    function spawnMegaBoss() {
      const m = newActor({
        kind: 'mega', team: 'neutral',
        name: 'RESTIVAL BEAST',
        x: 0, z: 0, hp: 900, attack: 22, speed: 4
      });
      placeMesh(m, global.createMegaBossMesh(THREE));
      world.megaBoss = m;
      hud.showBanner('System', 'A massive boss appears at the center! Kill it for a HUGE score!');
    }

    // ---------------------------------------------------------- combat
    function applyBuffs(actor) {
      actor.speed = actor.baseSpeed;
      actor.attack = actor.baseAttack;
      actor.dmgTakenMult = 1.0;
      actor.regenHpPerSec = 0;
      for (const b of actor.buffs) {
        if (b.mult) {
          if (b.mult.dmg)      actor.attack *= b.mult.dmg;
          if (b.mult.speed)    actor.speed  *= b.mult.speed;
          if (b.mult.dmgTaken) actor.dmgTakenMult *= b.mult.dmgTaken;
        }
        if (b.regenHpPerSec) actor.regenHpPerSec += b.regenHpPerSec;
      }
    }

    function dealDamage(target, attacker, dmg) {
      if (!target.alive) return;
      let amount = Math.max(0, dmg) * (target.dmgTakenMult || 1.0);
      if (target.shield > 0) {
        const absorbed = Math.min(target.shield, amount);
        target.shield -= absorbed;
        amount -= absorbed;
      }
      target.hp -= amount;
      if (attacker && attacker.stats) attacker.stats.dmg += Math.round(amount);
      if (target.stats) target.stats.dmgTaken += Math.round(amount);
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        if (target.mesh) target.mesh.visible = false;
        target.respawnTimer = (target.kind === 'player' || target.kind === 'bot')
          ? CFG.baseRespawnSec
          : 999;
        vfx.burst({ type: 'death', pos: new THREE.Vector3(target.x, 1, target.z), color: 0xff5577, scale: 1.4 });
        if (attacker && attacker.stats && (target.kind === 'player' || target.kind === 'bot')) {
          attacker.stats.kills++;
        }
        if (target.kind === 'player' || target.kind === 'bot') {
          target.stats.deaths++;
          hud.pushKill(`${attacker?.name || '?'} eliminated ${target.name}`,
            attacker?.team === 'player' ? '#7fd0ff' : '#ff8898');
          if (attacker && (attacker.kind === 'player' || attacker.kind === 'bot')) {
            grantXp(attacker, CFG.eliminationXp);
          }
        }
        if (target.kind === 'wild') {
          if (attacker) grantXp(attacker, CFG.wildRobotXp);
          target._cleanup = true;
        }
        if (target.kind === 'boss') {
          if (target.buff && attacker) applyBuffToTeam(attacker.team, target.buff);
          if (attacker) grantXp(attacker, CFG.bossXp);
          hud.pushKill(`${attacker?.team === 'player' ? 'Your team' : 'Enemy team'} secured ${target.buff?.name || 'a buff'}!`,
                       attacker?.team === 'player' ? '#7fd0ff' : '#ff8898');
          target._cleanup = true;
        }
        if (target.kind === 'mega') {
          const winnerTeam = attacker ? attacker.team : 'player';
          const loserTeam  = winnerTeam === 'player' ? 'enemy' : 'player';
          const victim = world.capturePoints.find(c => c.alive && c.owner === loserTeam);
          if (victim) { destroyCircle(victim, winnerTeam); }
          world.score[winnerTeam] += CFG.centerBossScore;
          hud.pushKill(`${winnerTeam === 'player' ? 'YOUR' : 'ENEMY'} team killed the RESTIVAL BEAST!`,
                       winnerTeam === 'player' ? '#ffe066' : '#ff8898');
          if (target.mesh) scene.remove(target.mesh);
          world.megaBoss = null;
        }
      }
    }

    function applyBuffToTeam(team, buffDef) {
      const list = team === 'player'
        ? [world.player].concat(world.allyBots)
        : world.enemyBots;
      for (const a of list) {
        if (!a) continue;
        const inst = Object.assign({}, buffDef, { ttl: buffDef.dur });
        a.buffs.push(inst);
        applyBuffs(a);
      }
    }

    function fireBasicAttack(self, target) {
      if (!target || !target.alive) return;
      const dmg = self.attack;
      vfx.burst({
        type: 'beam',
        pos: new THREE.Vector3(self.x, 2.4, self.z),
        dir: new THREE.Vector3(target.x - self.x, 0, target.z - self.z).normalize(),
        range: Math.min(20, Math.hypot(target.x - self.x, target.z - self.z)),
        color: 0x39f5ff, scale: 0.8, count: 18
      });
      dealDamage(target, self, dmg);
    }

    function castPower(self, slotEntry, _targetOverride) {
      if (!slotEntry || !slotEntry.def) return false;
      if (slotEntry.cd > 0) return false;
      const p = slotEntry.def;
      slotEntry.cd = p.cooldown;

      const dir    = new THREE.Vector3(Math.cos(self.facing), 0, Math.sin(self.facing));
      const center = new THREE.Vector3(self.x, 1.5, self.z);

      vfx.burst({
        type: p.vfx, pos: center, color: p.color, dir,
        range: p.range, scale: 1.6, count: 70
      });

      const enemies = (self.team === 'player')
        ? world.enemyBots.concat(world.wildRobots, world.bosses)
        : world.allyBots.concat(world.wildRobots, world.bosses);
      if (world.player && self.team === 'enemy') enemies.push(world.player);
      if (world.megaBoss) enemies.push(world.megaBoss);

      function withinAoe(t, rad) {
        const dx = t.x - self.x, dz = t.z - self.z;
        return (dx * dx + dz * dz) <= rad * rad;
      }
      function withinCone(t, rad) {
        const dx = t.x - self.x, dz = t.z - self.z;
        const len = Math.hypot(dx, dz);
        if (len > rad) return false;
        const dotv = (dx / len) * dir.x + (dz / len) * dir.z;
        return dotv > 0.55;
      }

      if (p.heal) {
        const allies = self.team === 'player'
          ? [world.player].concat(world.allyBots)
          : world.enemyBots;
        for (const a of allies) {
          if (!a || !a.alive) continue;
          if (withinAoe(a, p.range)) {
            const before = a.hp;
            a.hp = Math.min(a.maxHp, a.hp + p.heal);
            const healed = a.hp - before;
            if (self.stats) self.stats.heal += Math.round(healed);
          }
        }
      } else if (p.shield) {
        self.shield += p.shield;
        setTimeout(() => { self.shield = Math.max(0, self.shield - p.shield); }, (p.dur || 4) * 1000);
      } else {
        const dmg = (p.dmg || 20) * (1 + (self.level - 1) * 0.06);
        for (const e of enemies) {
          if (!e || !e.alive) continue;
          let hit = false;
          if (p.vfx === 'cone') hit = withinCone(e, p.range);
          else if (p.vfx === 'beam') {
            if (withinCone(e, p.range)) hit = true;
          } else {
            hit = withinAoe(e, p.range || 10);
          }
          if (hit) {
            dealDamage(e, self, dmg);
            if (p.slow) {
              e.buffs.push({ id: 'slow', mult: { speed: 1 - p.slow }, ttl: p.slowDur });
              applyBuffs(e);
            }
          }
        }
      }
      return true;
    }

    // ---------------------------------------------------------- capture
    function captureProgress(cp, actor, deltaPerSec) {
      if (!cp.alive) return;
      const team = actor.team;
      const own  = cp.owner;
      if (team === own) {
        cp.progress = Math.min(1, cp.progress + deltaPerSec);
      } else {
        cp.progress -= deltaPerSec;
        if (cp.progress <= 0) {
          cp.progress = 0.05;
          cp.owner = team;
          cp.mesh.setOwner(team);
          if (actor.stats) actor.stats.scored++;
          vfx.burst({
            type: 'capture', pos: new THREE.Vector3(cp.x, 0.5, cp.z),
            color: team === 'player' ? 0x3aa3ff : 0xff3b55, scale: 1.5, count: 60
          });
          hud.pushKill(`${actor.name} captured ${cp.id}`,
            team === 'player' ? '#7fd0ff' : '#ff8898');
        }
      }
      if (cp.owner === team && cp.progress >= 1.0) {
        cp.overload = (cp.overload || 0) + deltaPerSec * 0.5;
        if (actor.stats) actor.stats.scored++;
        world.score[team]++;
        if (cp.overload >= 1.0) {
          destroyCircle(cp, team);
        }
      }
      cp.mesh.setProgress(cp.progress);
    }

    function destroyCircle(cp, winnerTeam) {
      cp.alive = false;
      cp.mesh.destroy(scene);
      vfx.burst({
        type: 'slam',
        pos: new THREE.Vector3(cp.x, 0.5, cp.z),
        color: winnerTeam === 'player' ? 0x39f5ff : 0xff5577, scale: 2.5, count: 120
      });
      hud.pushKill(`${cp.id} destroyed!`,
        winnerTeam === 'player' ? '#39f5ff' : '#ff5577');
    }

    // ---------------------------------------------------------- XP / level
    function grantXp(actor, amount) {
      if (actor.level >= CFG.maxLevel) return;
      actor.xp += amount;
      const need = CFG.xpPerLevel(actor.level);
      if (actor.xp >= need) {
        actor.xp -= need;
        actor.level++;
        actor.maxHp += 24;
        actor.hp = Math.min(actor.maxHp, actor.hp + 24);
        actor.baseAttack += 2;
        applyBuffs(actor);

        vfx.burst({
          type: 'level_up',
          pos: new THREE.Vector3(actor.x, 0.5, actor.z),
          color: actor.team === 'player' ? 0x39f5ff : 0xff5577, scale: 1.4, count: 90
        });

        if (actor.level === CFG.uniteUnlockLevel) {
          actor.unite.ready = false;
          actor.unite.cd = UNITE.cooldown * 0.5;
          if (actor.kind === 'player') hud.showBanner('System', 'UNITE MOVE UNLOCKED!');
        }
        if (actor.kind === 'player' && CFG.pickPowerAtLevels.indexOf(actor.level) !== -1) {
          offerPowerPick(actor);
        }
        if (actor.kind === 'bot' && actor.powers.length < CFG.powerSlotCount && actor.level >= 3) {
          const have = actor.powers.map(pp => pp.def.id);
          const pool = POWERS.filter(p => !have.includes(p.id));
          if (pool.length) {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            actor.powers.push({ slot: 'p2', def: pick, cd: 0, level: 1 });
          }
        }
        if (actor.kind === 'bot' && actor.powers.length && actor.level > 1) {
          const p = actor.powers[Math.floor(Math.random() * actor.powers.length)];
          p.level = Math.min(5, (p.level || 1) + 1);
        }
      }
    }

    function offerPowerPick(player) {
      const have = player.powers.map(p => p.def.id);
      const pool = POWERS.filter(p => !have.includes(p.id));
      const offers = [];
      while (offers.length < 3 && pool.length) {
        const idx = Math.floor(Math.random() * pool.length);
        offers.push(pool.splice(idx, 1)[0]);
      }
      if (offers.length === 0) return;
      hud.showPowerPicker(player.level, offers, (chosen) => {
        if (player.powers.length < CFG.powerSlotCount) {
          player.powers.push({ slot: player.powers.length === 0 ? 'p1' : 'p2', def: chosen, cd: 0, level: 1 });
        } else {
          player.powers[player.powers.length - 1].def = chosen;
          player.powers[player.powers.length - 1].cd = 0;
          player.powers[player.powers.length - 1].level = 1;
        }
        hud.setAbilityIcon('p1', player.powers[0]?.def || null);
        hud.setAbilityIcon('p2', player.powers[1]?.def || null);
        hud.showBanner('System', `Acquired: ${chosen.name}`);
      });
    }

    // ---------------------------------------------------------- respawn
    function respawnBot(actor) {
      actor.alive = true;
      actor.hp = actor.maxHp;
      actor.x = actor.spawn.x;
      actor.z = actor.spawn.z;
      actor.targetCp = null;
      if (actor.mesh) {
        actor.mesh.position.set(actor.x, 0, actor.z);
        actor.mesh.visible = true;
      }
    }

    // ---------------------------------------------------------- public API
    world.fireBasicAttack = fireBasicAttack;
    world.castPower       = castPower;
    world.dealDamage      = dealDamage;
    world.captureProgress = captureProgress;
    world.respawnBot      = respawnBot;
    world.grantXp         = grantXp;
    world.destroyCircle   = destroyCircle;

    // ---------------------------------------------------------- setup
    world.player        = buildPlayer();
    world.allyBots      = buildTeamBots('player');
    world.enemyBots     = buildTeamBots('enemy');
    world.capturePoints = buildCapturePoints();

    hud.setAbilityIcon('p1', world.player.powers[0]?.def || null);
    hud.setAbilityIcon('p2', world.player.powers[1]?.def || null);

    // ---------------------------------------------------------- per-frame
    function updateBuffs(actor, dt) {
      if (!actor.alive || !actor.buffs.length) return;
      for (let i = actor.buffs.length - 1; i >= 0; i--) {
        const b = actor.buffs[i];
        if (b.ttl != null) {
          b.ttl -= dt;
          if (b.ttl <= 0) actor.buffs.splice(i, 1);
        }
      }
      applyBuffs(actor);
      if (actor.regenHpPerSec) {
        actor.hp = Math.min(actor.maxHp, actor.hp + actor.regenHpPerSec * dt);
      }
    }

    function updateAbilityCds(actor, dt) {
      for (const slot of actor.powers) {
        if (slot.cd > 0) slot.cd = Math.max(0, slot.cd - dt);
      }
      if (actor.unite) {
        if (actor.unite.cd > 0) actor.unite.cd = Math.max(0, actor.unite.cd - dt);
        actor.unite.ready = (actor.level >= CFG.uniteUnlockLevel) && actor.unite.cd <= 0;
      }
    }

    function checkVictory() {
      if (world.over) return;
      const aliveAllies  = world.capturePoints.filter(c => c.alive && c.owner === 'player').length;
      const aliveEnemies = world.capturePoints.filter(c => c.alive && c.owner === 'enemy').length;
      if (aliveAllies <= 0 && aliveEnemies <= 0) endMatch('draw');
      else if (aliveAllies  <= 0) endMatch('enemy');
      else if (aliveEnemies <= 0) endMatch('player');
      else if (world.time >= world.durationSec) {
        if (aliveAllies > aliveEnemies)      endMatch('player');
        else if (aliveEnemies > aliveAllies) endMatch('enemy');
        else if (world.score.player > world.score.enemy) endMatch('player');
        else if (world.score.enemy > world.score.player) endMatch('enemy');
        else endMatch('draw');
      }
    }

    function endMatch(winner) {
      world.over = true;
      world.winner = winner;
      if (typeof ctx.onMatchEnd === 'function') ctx.onMatchEnd(winner, world);
    }

    function update(dt) {
      if (world.over) return;
      world.time += dt;

      // spawn schedules
      world.nextWildSpawn -= dt;
      if (world.nextWildSpawn <= 0) {
        spawnWildRobot();
        world.nextWildSpawn = CFG.wildRobotRespawn;
      }
      world.nextSideBoss -= dt;
      if (world.nextSideBoss <= 0) {
        if (world.bosses.filter(b => b.alive).length === 0) spawnSideBoss();
        world.nextSideBoss = CFG.sideBossRespawn;
      }
      if (!world.mbSpawned && world.time >= CFG.centerBossAt) {
        world.mbSpawned = true;
        spawnMegaBoss();
      }

      // update actors
      const AI  = global.MOBA_AI;
      const all = [world.player].concat(world.allyBots, world.enemyBots);
      for (const a of all) {
        if (!a) continue;
        updateBuffs(a, dt);
        updateAbilityCds(a, dt);
        if (a.kind === 'player') {
          // movement handled outside (player input loop in game-scene.js)
        } else {
          AI.updateBot(a, dt, world);
        }
        if (a.mesh && a.alive) {
          a.mesh.position.set(a.x, 0, a.z);
          a.mesh.rotation.y = -a.facing;
          a.mesh.userData.animPhase = (a.mesh.userData.animPhase || 0) + dt * 8;
          const bob = Math.sin(a.mesh.userData.animPhase) * 0.08 * a.mesh.userData.scale;
          a.mesh.position.y = bob;
        }
      }
      for (const w of world.wildRobots) {
        AI.updateWildRobot(w, dt, world);
        if (w.mesh) {
          w.mesh.position.x = w.x;
          w.mesh.position.z = w.z;
          w.mesh.position.y = Math.sin(world.time * 3 + w.x) * 0.15;
        }
      }
      for (const b of world.bosses) {
        AI.updateBoss(b, dt, world);
        if (b.mesh) {
          b.mesh.position.x = b.x;
          b.mesh.position.z = b.z;
          b.mesh.rotation.y += dt * 0.4;
        }
      }
      if (world.megaBoss) {
        AI.updateBoss(world.megaBoss, dt, world);
        if (world.megaBoss.mesh) {
          world.megaBoss.mesh.rotation.y += dt * 0.6;
          world.megaBoss.mesh.position.y = Math.sin(world.time * 1.5) * 0.3 + 0.2;
        }
      }
      // cleanup
      for (let i = world.wildRobots.length - 1; i >= 0; i--) {
        const w = world.wildRobots[i];
        if (w._cleanup) {
          if (w.mesh) scene.remove(w.mesh);
          world.wildRobots.splice(i, 1);
        }
      }
      for (let i = world.bosses.length - 1; i >= 0; i--) {
        const b = world.bosses[i];
        if (b._cleanup) {
          if (b.mesh) scene.remove(b.mesh);
          world.bosses.splice(i, 1);
        }
      }

      checkVictory();
    }

    world.update = update;
    return world;
  }

  global.createMobaWorld = createMobaWorld;
})(typeof window !== 'undefined' ? window : globalThis);
