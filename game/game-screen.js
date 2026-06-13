/**
 * FamiliarBot League — Game / Arena scene launcher  (MOBA REWRITE).
 *
 * Pokémon-Unite-style 5v5 inside the existing 844x390 Three.js stage.
 *  • 1 player + 4 AI allies vs 5 AI enemies
 *  • 5 capture circles per side (from the arena config) — fill them with
 *    "scoring" to destroy them. Whoever runs out of circles loses.
 *  • Central RESTIVAL altar becomes a MEGA-BOSS at 2:00 remaining; killing it
 *    immediately destroys an enemy circle (effectively instant score).
 *  • Wild robots roam the jungle and grant XP; bosses spawn at the edges and
 *    drop buffs.
 *  • XP / Level system 1–15, new powers offered at Lv 3/5/7/9/11
 *    (max 2 carried + 1 Unite Move unlocked at Lv 6).
 *  • All robots are placeholder capsule/box meshes — no FBX/GLB loading.
 *
 * Music: still routes through FamiliarBotAudio.play('game') so the arena
 * track keeps playing.
 *
 * Public API unchanged:
 *   FamiliarBotGame.start({ botId, displayName, role, onExit, onHome })
 */
(function () {
  const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

  // We keep loading the legacy arena modules so the visual base (floor,
  // walls, pillars, glow pools, altar, etc.) continues to render. The new
  // MOBA layer just ADDS gameplay objects on top.
  const ARENA_SCRIPTS = [
    "./arena/arena-config.js",
    "./arena/opal-battlefield.js",
    "./arena/floor.js",
    "./arena/perimeter-wall.js",
    "./arena/glow-pools.js",
    "./arena/jungle-bushes.js",
    "./arena/walls.js",
    "./arena/pillars.js",
    "./arena/capture-points.js",
    "./arena/spawn-pads.js",
    "./arena/altar.js",
    "./arena/index.js"
  ];

  const MOBA_SCRIPTS = [
    "./moba/config.js",
    "./moba/vfx.js",
    "./moba/entities.js",
    "./moba/ai.js",
    "./moba/hud.js",
    "./moba/victory.js"
  ];

  const scriptEl = document.currentScript ||
    Array.from(document.scripts).find((s) => /game-screen\.js/.test(s.src));
  const baseHref = scriptEl ? new URL(scriptEl.src, window.location.href) : window.location.href;
  const resolve = (path) => new URL(path, baseHref).href;

  function loadScript(src) {
    return new Promise((done, fail) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        if (existing.dataset.loaded === "true") return done();
        existing.addEventListener("load", () => done());
        existing.addEventListener("error", () => fail(new Error(`Failed to load ${src}`)));
        return;
      }
      const tag = document.createElement("script");
      tag.src = src;
      tag.async = false;
      tag.addEventListener("load", () => { tag.dataset.loaded = "true"; done(); });
      tag.addEventListener("error", () => fail(new Error(`Failed to load ${src}`)));
      document.head.appendChild(tag);
    });
  }

  async function ensureThree() {
    if (typeof window.THREE !== "undefined") return true;
    try { await loadScript(THREE_CDN); return typeof window.THREE !== "undefined"; }
    catch (err) { console.warn("[Game] THREE.js failed:", err.message); return false; }
  }
  async function ensureModules(list) {
    for (const path of list) {
      try { await loadScript(resolve(path)); }
      catch (err) { console.warn("[Game] module failed:", path, err.message); return false; }
    }
    return true;
  }

  // ---------------------------------------------------------------- ROSTER
  const FALLBACK_NAMES = [
    "Nova", "Echo", "Onyx", "Ace", "Spark", "Pixel", "Rune", "Bolt", "Halo", "Vortex"
  ];
  const ROLES = ['All-Rounder', 'Fighter', 'Speedster', 'Tank', 'Supporter', 'Bruiser', 'Trickster'];

  function pickRosterFor(team, excludeBotId, count) {
    const ids = (window.MOBA_ROSTER || ['atlas','blaze','volt','sage','bastion','vex','bruno']).slice();
    // Make sure the player's bot id isn't reused on the same team.
    const arr = [];
    for (let i = 0; i < count; i++) {
      let id;
      do { id = ids[Math.floor(Math.random() * ids.length)]; }
      while (team === 'player' && id === excludeBotId && ids.length > 1);
      arr.push(id);
    }
    return arr;
  }

  // ---------------------------------------------------------------- WORLD
  function createWorld(scene, vfx, hud, ctx) {
    const THREE = window.THREE;
    const CFG = window.MOBA_CONFIG;
    const POWERS = window.MOBA_POWERS;
    const UNITE  = window.MOBA_UNITE;

    const TERRAIN_CP = (window.TERRAIN && window.TERRAIN.capturePoints) || [];

    const world = {
      time: 0,                          // seconds elapsed
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
      nextSideBoss: CFG.sideBossInitial,
      mbSpawned: false,

      // scores (sum of fills cashed on circles destroyed, basically)
      score: { player: 0, enemy: 0 },
    };

    // -- factory helpers ---------------------------------------------------
    function makeStats() {
      return { scored:0, kills:0, deaths:0, assists:0, dmg:0, dmgTaken:0, heal:0 };
    }

    function newActor(opts) {
      const a = {
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
        powers: [],     // chosen powers [{slot, def, cd, level}]
        unite: { def: UNITE, cd: 0, ready: false },
        buffs: [],
        respawnTimer: 0,
        spawn: { x: opts.x, z: opts.z },
        targetCp: null,
        mesh: null,
        stats: makeStats()
      };
      return a;
    }

    function placeMesh(actor, mesh) {
      mesh.position.set(actor.x, 0, actor.z);
      scene.add(mesh);
      actor.mesh = mesh;
    }

    function buildPlayer() {
      const botId = ctx.botId;
      const accent = (window.MOBA_BOTS && window.MOBA_BOTS[botId]) || { body: 0x4a87b8, head:0x5fa8d8, glow:0x39f5ff, role: 'All-Rounder' };
      const p = newActor({
        kind: 'player', id: 'player', team: 'player',
        botId, name: ctx.displayName, role: ctx.role || accent.role,
        x: -74, z: 0, hp: 220, attack: 22, speed: 18
      });
      placeMesh(p, window.createBotMesh(THREE, accent, { scale: 1.1, isEnemy: false }));
      // Start with a random power
      const first = POWERS[Math.floor(Math.random() * POWERS.length)];
      p.powers.push({ slot: 'p1', def: first, cd: 0, level: 1 });
      world.player = p;
      return p;
    }

    function buildTeamBots(team) {
      const arr = [];
      const ids = pickRosterFor(team, ctx.botId, 4);
      for (let i = 0; i < 4; i++) {
        const accent = window.MOBA_BOTS[ids[i]] || { body:0x444, head:0x666, glow:0xffffff, role:'Bot' };
        const name = FALLBACK_NAMES[(Math.floor(Math.random()*FALLBACK_NAMES.length) + i) % FALLBACK_NAMES.length];
        const spawn = team === 'player'
          ? { x: -72 + (i-2)*3, z: -12 + i*7 }
          : { x:  72 + (i-2)*3, z: -12 + i*7 };
        const a = newActor({
          kind: 'bot', id: `${team}-${i}`,
          team, botId: ids[i], name, role: accent.role,
          x: spawn.x, z: spawn.z,
          hp: 180, attack: 16, speed: 14 + Math.random()*3
        });
        // Give AI bots a random starting power
        const p1 = POWERS[Math.floor(Math.random() * POWERS.length)];
        a.powers.push({ slot: 'p1', def: p1, cd: 0, level: 1 });
        if (Math.random() > 0.4) {
          let p2;
          do { p2 = POWERS[Math.floor(Math.random() * POWERS.length)]; }
          while (p2.id === p1.id);
          a.powers.push({ slot: 'p2', def: p2, cd: 0, level: 1 });
        }
        placeMesh(a, window.createBotMesh(THREE, accent, { scale: 1.0, isEnemy: team === 'enemy' }));
        arr.push(a);
      }
      return arr;
    }

    function buildCapturePoints() {
      const out = [];
      for (const def of TERRAIN_CP) {
        const team = def.side; // 'player' | 'enemy' — starts owned by that team
        const cc = window.createCaptureCircleMesh(THREE, {
          radius: def.radius, team
        });
        const x = def.pos[0], z = def.pos[1];
        cc.group.position.set(x, 0, z);
        scene.add(cc.group);
        out.push({
          id: def.id, side: def.side,
          x, z, radius: def.radius,
          owner: team,                  // who currently controls
          alive: true,
          progress: 1.0,                // 1 = fully owned by `owner`. 0 = neutral.
          mesh: cc
        });
      }
      return out;
    }

    function spawnWildRobot() {
      // randomly pick one of the 4 jungle clusters
      const jc = (window.TERRAIN && window.TERRAIN.jungleClusters) || [
        { pos: [-14,-16] }, { pos: [-14,16] }, { pos:[14,-16] }, { pos:[14,16] }
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
      placeMesh(w, window.createWildRobotMesh(THREE, 0x6a3aa8));
      world.wildRobots.push(w);
    }

    function spawnSideBoss() {
      // Spawn 2 bosses at top/bottom edges
      const slots = [{ x: 0, z: -36 }, { x: 0, z: 36 }];
      for (const s of slots) {
        const b = newActor({
          kind: 'boss', team: 'neutral',
          name: 'Wild Boss',
          x: s.x, z: s.z, hp: 360, attack: 14, speed: 5
        });
        b.buff = pickRandomBuff();
        placeMesh(b, window.createBossMesh(THREE, 0xff7a2a, { scale: 1.4 }));
        world.bosses.push(b);
      }
    }

    function pickRandomBuff() {
      const buffs = Object.values(window.MOBA_BUFFS || {});
      return buffs[Math.floor(Math.random() * buffs.length)] || null;
    }

    function spawnMegaBoss() {
      const m = newActor({
        kind: 'mega', team: 'neutral',
        name: 'RESTIVAL BEAST',
        x: 0, z: 0, hp: 900, attack: 22, speed: 4
      });
      placeMesh(m, window.createMegaBossMesh(THREE));
      world.megaBoss = m;
      hud.showBanner('System', 'A massive boss appears at the center! Kill it for a HUGE score!');
    }

    // -- combat -----------------------------------------------------------
    function applyBuffs(actor) {
      // Recompute derived stats from baseline + buffs
      actor.speed = actor.baseSpeed;
      actor.attack = actor.baseAttack;
      actor.dmgTakenMult = 1.0;
      actor.regenHpPerSec = 0;
      for (const b of actor.buffs) {
        if (b.mult) {
          if (b.mult.dmg)     actor.attack *= b.mult.dmg;
          if (b.mult.speed)   actor.speed  *= b.mult.speed;
          if (b.mult.dmgTaken)actor.dmgTakenMult *= b.mult.dmgTaken;
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
          : 999; // wild/bosses get respawned by the world timer
        vfx.burst({ type: 'death', pos: new THREE.Vector3(target.x, 1, target.z), color: 0xff5577, scale: 1.4 });
        if (attacker && attacker.stats && (target.kind === 'player' || target.kind === 'bot')) {
          attacker.stats.kills++;
        }
        if (target.kind === 'player' || target.kind === 'bot') {
          target.stats.deaths++;
          hud.pushKill(`${attacker?.name || '?'} eliminated ${target.name}`,
            attacker?.team === 'player' ? '#7fd0ff' : '#ff8898');
          // XP to attacker
          if (attacker && (attacker.kind === 'player' || attacker.kind === 'bot')) {
            grantXp(attacker, CFG.eliminationXp);
          }
        }
        if (target.kind === 'wild') {
          if (attacker) grantXp(attacker, CFG.wildRobotXp);
          // remove later
          target._cleanup = true;
        }
        if (target.kind === 'boss') {
          // grant buff to attacker's team
          if (target.buff && attacker) applyBuffToTeam(attacker.team, target.buff);
          if (attacker) grantXp(attacker, CFG.bossXp);
          hud.pushKill(`${attacker?.team === 'player' ? 'Your team' : 'Enemy team'} secured ${target.buff?.name || 'a buff'}!`,
                       attacker?.team === 'player' ? '#7fd0ff' : '#ff8898');
          target._cleanup = true;
        }
        if (target.kind === 'mega') {
          // Instant score: destroy an enemy circle
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
      // small visual line
      vfx.burst({
        type: 'beam',
        pos: new THREE.Vector3(self.x, 2.4, self.z),
        dir: new THREE.Vector3(target.x - self.x, 0, target.z - self.z).normalize(),
        range: Math.min(20, Math.hypot(target.x - self.x, target.z - self.z)),
        color: 0x39f5ff, scale: 0.8, count: 18
      });
      dealDamage(target, self, dmg);
    }

    function castPower(self, slotEntry, targetOverride) {
      // slotEntry = entry from self.powers[] (or unite shortcut)
      if (!slotEntry || !slotEntry.def) return false;
      if (slotEntry.cd > 0) return false;
      const p = slotEntry.def;
      slotEntry.cd = p.cooldown;

      const dir = new THREE.Vector3(Math.cos(self.facing), 0, Math.sin(self.facing));
      const center = new THREE.Vector3(self.x, 1.5, self.z);

      vfx.burst({
        type: p.vfx, pos: center, color: p.color, dir,
        range: p.range, scale: 1.6, count: 70
      });

      // Resolve targets
      const enemies = (self.team === 'player')
        ? world.enemyBots.concat(world.wildRobots, world.bosses)
        : world.allyBots.concat(world.wildRobots, world.bosses);
      if (world.player && self.team === 'enemy') enemies.push(world.player);
      if (world.megaBoss) enemies.push(world.megaBoss);

      function withinAoe(t, rad) {
        const dx = t.x - self.x, dz = t.z - self.z;
        return (dx*dx + dz*dz) <= rad*rad;
      }
      function withinCone(t, rad) {
        const dx = t.x - self.x, dz = t.z - self.z;
        const len = Math.hypot(dx, dz);
        if (len > rad) return false;
        const dotv = (dx/len) * dir.x + (dz/len) * dir.z;
        return dotv > 0.55; // ~57° cone
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
            // hit one nearest in front
            if (withinCone(e, p.range)) hit = true;
          } else {
            hit = withinAoe(e, p.range || 10);
          }
          if (hit) {
            dealDamage(e, self, dmg);
            if (p.slow) {
              e.buffs.push({ id:'slow', mult: { speed: 1 - p.slow }, ttl: p.slowDur });
              applyBuffs(e);
            }
          }
        }
      }
      return true;
    }

    // -- capture / score --------------------------------------------------
    function captureProgress(cp, actor, deltaPerSec) {
      if (!cp.alive) return;
      const team = actor.team;
      const own = cp.owner;
      if (team === own) {
        // already ours — push toward 1.0 (no change for now)
        cp.progress = Math.min(1, cp.progress + deltaPerSec);
        // If full, allow "destruction" by additional pressure (overload)
        if (cp.progress >= 1.0 && actor.kind === 'bot' === false) { /* noop */ }
      } else {
        // contested: drain toward 0 then take ownership
        cp.progress -= deltaPerSec;
        if (cp.progress <= 0) {
          cp.progress = 0.05;
          cp.owner = team;
          cp.mesh.setOwner(team);
          if (actor.stats) actor.stats.scored++;
          vfx.burst({ type: 'capture', pos: new THREE.Vector3(cp.x, 0.5, cp.z),
                     color: team === 'player' ? 0x3aa3ff : 0xff3b55, scale: 1.5, count: 60 });
          hud.pushKill(`${actor.name} captured ${cp.id}`,
            team === 'player' ? '#7fd0ff' : '#ff8898');
        }
      }
      // Once we OWN it AND keep scoring on it, eventually destroy it.
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
      vfx.burst({ type: 'slam',
        pos: new THREE.Vector3(cp.x, 0.5, cp.z),
        color: winnerTeam === 'player' ? 0x39f5ff : 0xff5577, scale: 2.5, count: 120 });
      hud.pushKill(`${cp.id} destroyed!`,
        winnerTeam === 'player' ? '#39f5ff' : '#ff5577');
    }

    // -- level / xp -------------------------------------------------------
    function grantXp(actor, amount) {
      if (actor.level >= CFG.maxLevel) return;
      actor.xp += amount;
      const need = CFG.xpPerLevel(actor.level);
      if (actor.xp >= need) {
        actor.xp -= need;
        actor.level++;
        // grow base stats
        actor.maxHp += 24;
        actor.hp = Math.min(actor.maxHp, actor.hp + 24);
        actor.baseAttack += 2;
        applyBuffs(actor);

        // VFX
        vfx.burst({ type: 'level_up',
          pos: new THREE.Vector3(actor.x, 0.5, actor.z),
          color: actor.team === 'player' ? 0x39f5ff : 0xff5577, scale: 1.4, count: 90 });

        // Unite unlock
        if (actor.level === CFG.uniteUnlockLevel) {
          actor.unite.ready = false;
          actor.unite.cd = UNITE.cooldown * 0.5;
          if (actor.kind === 'player') hud.showBanner('System', 'UNITE MOVE UNLOCKED!');
        }
        // Player gets to PICK a new power
        if (actor.kind === 'player' && CFG.pickPowerAtLevels.indexOf(actor.level) !== -1) {
          offerPowerPick(actor);
        }
        // AI bots: auto-add a 2nd power if missing
        if (actor.kind === 'bot' && actor.powers.length < CFG.powerSlotCount && actor.level >= 3) {
          const have = actor.powers.map(pp => pp.def.id);
          const pool = POWERS.filter(p => !have.includes(p.id));
          if (pool.length) {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            actor.powers.push({ slot: 'p2', def: pick, cd: 0, level: 1 });
          }
        }
        // AI bots: level up an existing power randomly
        if (actor.kind === 'bot' && actor.powers.length && actor.level > 1) {
          const p = actor.powers[Math.floor(Math.random() * actor.powers.length)];
          p.level = Math.min(5, (p.level || 1) + 1);
        }
      }
    }

    function offerPowerPick(player) {
      const have = player.powers.map(p => p.def.id);
      const pool = POWERS.filter(p => !have.includes(p.id));
      // pick 3 random offers
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
          // replace the LAST power slot by default
          player.powers[player.powers.length - 1].def = chosen;
          player.powers[player.powers.length - 1].cd = 0;
          player.powers[player.powers.length - 1].level = 1;
        }
        // refresh HUD icons
        hud.setAbilityIcon('p1', player.powers[0]?.def || null);
        hud.setAbilityIcon('p2', player.powers[1]?.def || null);
        hud.showBanner('System', `Acquired: ${chosen.name}`);
      });
    }

    // -- respawn ----------------------------------------------------------
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

    // -- public hooks for AI module ---------------------------------------
    world.fireBasicAttack = fireBasicAttack;
    world.castPower       = castPower;
    world.dealDamage      = dealDamage;
    world.captureProgress = captureProgress;
    world.respawnBot      = respawnBot;
    world.grantXp         = grantXp;
    world.destroyCircle   = destroyCircle;

    // -- world setup ------------------------------------------------------
    world.player    = buildPlayer();
    world.allyBots  = buildTeamBots('player');
    world.enemyBots = buildTeamBots('enemy');
    world.capturePoints = buildCapturePoints();

    // Initialize HUD ability icons.
    hud.setAbilityIcon('p1', world.player.powers[0]?.def || null);
    hud.setAbilityIcon('p2', world.player.powers[1]?.def || null);

    // -- per-frame --------------------------------------------------------
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
      const aliveAllies = world.capturePoints.filter(c => c.alive && c.owner === 'player').length;
      const aliveEnemies = world.capturePoints.filter(c => c.alive && c.owner === 'enemy').length;
      // central destruction: in our simplified design, the central altar is
      // the MEGA boss — once killed, the loser's last circle is destroyed
      // already (see dealDamage). So victory check is just "no circles left".
      if (aliveAllies <= 0 && aliveEnemies <= 0) endMatch('draw');
      else if (aliveAllies <= 0) endMatch('enemy');
      else if (aliveEnemies <= 0) endMatch('player');
      else if (world.time >= world.durationSec) {
        // Time's up — whoever has more circles wins; tie -> score; tie -> draw
        if (aliveAllies > aliveEnemies) endMatch('player');
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
      const AI = window.MOBA_AI;
      const all = [world.player].concat(world.allyBots, world.enemyBots);
      for (const a of all) {
        if (!a) continue;
        updateBuffs(a, dt);
        updateAbilityCds(a, dt);
        if (a.kind === 'player') {
          // movement handled outside (player input)
        } else {
          AI.updateBot(a, dt, world);
        }
        // pose mesh
        if (a.mesh && a.alive) {
          a.mesh.position.set(a.x, 0, a.z);
          a.mesh.rotation.y = -a.facing;
          // simple walk bob
          a.mesh.userData.animPhase = (a.mesh.userData.animPhase || 0) + dt * 8;
          const bob = Math.sin(a.mesh.userData.animPhase) * 0.08 * a.mesh.userData.scale;
          a.mesh.position.y = bob;
        }
      }
      // wild robots
      for (const w of world.wildRobots) {
        AI.updateWildRobot(w, dt, world);
        if (w.mesh) { w.mesh.position.x = w.x; w.mesh.position.z = w.z; w.mesh.position.y = Math.sin(world.time*3 + w.x)*0.15; }
      }
      // bosses
      for (const b of world.bosses) {
        AI.updateBoss(b, dt, world);
        if (b.mesh) {
          b.mesh.position.x = b.x; b.mesh.position.z = b.z;
          b.mesh.rotation.y += dt * 0.4;
        }
      }
      if (world.megaBoss) {
        AI.updateBoss(world.megaBoss, dt, world);
        if (world.megaBoss.mesh) {
          world.megaBoss.mesh.rotation.y += dt * 0.6;
          world.megaBoss.mesh.position.y = Math.sin(world.time*1.5)*0.3 + 0.2;
        }
      }
      // cleanup dead wilds/bosses
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

  // -------------------------------------------------------- THREE SCENE
  function startThreeScene(canvas, ctx, hudHandle) {
    const THREE = window.THREE;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07101c);
    scene.fog = new THREE.FogExp2(0x07101c, 0.008);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 800);
    camera.position.set(0, 80, 90);
    camera.lookAt(0, 0, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0x88aacc, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(60, 100, 40);
    scene.add(dir);

    // Build arena visuals using existing arena modules.
    try {
      if (typeof window.buildTerrain === 'function') window.buildTerrain(scene);
    } catch (err) {
      console.warn("[Game] buildTerrain failed:", err);
      // Fallback flat plane
      const planeGeo = new THREE.PlaneGeometry(180, 100);
      const planeMat = new THREE.MeshStandardMaterial({ color: 0x4a4a44 });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);
    }

    // VFX pool
    const vfx = window.createVfxSystem(scene);

    // MOBA world
    const world = createWorld(scene, vfx, hudHandle, ctx);

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
          const dd = (e.x-player.x)*(e.x-player.x) + (e.z-player.z)*(e.z-player.z);
          if (dd < bd) { bd = dd; best = e; }
        }
        if (best && bd < 18*18) world.fireBasicAttack(player, best);
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
        // Eject Button — use a "ticket" to instantly score on the nearest enemy circle
        if (world.ejectStock == null) world.ejectStock = 12;
        if (world.ejectMax == null)   world.ejectMax   = 30;
        if (world.ejectStock > 0) {
          let best = null, bd = Infinity;
          for (const cp of world.capturePoints) {
            if (!cp.alive) continue;
            if (cp.owner === 'player') continue;
            const dd = (cp.x-player.x)*(cp.x-player.x) + (cp.z-player.z)*(cp.z-player.z);
            if (dd < bd) { bd = dd; best = cp; }
          }
          if (best && bd < 14*14) {
            // dump 6 score
            for (let i = 0; i < 6; i++) world.captureProgress(best, player, 0.18);
            player.stats.scored += 6;
            vfx.burst({ type:'capture',
              pos: new THREE.Vector3(best.x, 0.5, best.z),
              color: 0x39f5ff, scale: 2, count: 100 });
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
      // teleport home with a tiny invuln window
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
      if (window.FamiliarBotAudio) {
        const muted = window.FamiliarBotAudio.toggleMute();
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
      if (fpsTimer >= 0.5) { fpsValue = fpsCount / fpsTimer; fpsCount = 0; fpsTimer = 0; hudHandle.setFps(fpsValue); }

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

        // Auto-score if standing in a circle we don't own (or we own and want to push)
        for (const cp of world.capturePoints) {
          if (!cp.alive) continue;
          const dd = (cp.x-player.x)*(cp.x-player.x) + (cp.z-player.z)*(cp.z-player.z);
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
      const xpNeed = window.MOBA_CONFIG.xpPerLevel(player.level);
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
      try { renderer.dispose(); } catch(e) {}
    }
    return { dispose, world };
  }

  // -------------------- Fallback 2D scene (kept tiny) -------------------
  function start2DScene(canvas, botName) {
    const ctx = canvas.getContext("2d");
    let stopped = false;
    function tick() {
      if (stopped) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.fillStyle = '#0a1424'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#c8eaff'; ctx.font = 'bold 14px Segoe UI, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('3D failed to load — please refresh.', w/2, h/2);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { dispose() { stopped = true; } };
  }

  // -------------------- public start() ----------------------------------
  async function start(options = {}) {
    const botId      = options.botId || "atlas";
    const display    = options.displayName || (botId.charAt(0).toUpperCase() + botId.slice(1));
    const role       = options.role || "All-Rounder";

    if (window.FamiliarBotAudio) window.FamiliarBotAudio.play("game");

    document.body.innerHTML = "";
    document.body.classList.remove("familiarbot-menu-active", "familiarbot-garage-active");
    document.body.classList.add("familiarbot-game-active");

    const stage = document.createElement("div");
    stage.className = "game-stage";

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    stage.appendChild(canvas);

    // Loading overlay
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "game-loading-overlay";
    loadingOverlay.innerHTML = `<div class="spinner"></div><div>ENTERING ARENA</div>`;
    stage.appendChild(loadingOverlay);

    document.body.appendChild(stage);

    requestAnimationFrame(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });

    // Make the canvas absolute so the HUD overlay can sit on top
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';

    // Modules
    let use3D = await ensureThree();
    if (use3D) use3D = await ensureModules(ARENA_SCRIPTS);
    const mobaReady = await ensureModules(MOBA_SCRIPTS);
    if (!mobaReady) console.warn('[Game] MOBA modules failed to load');

    // Build HUD overlay
    const hud = window.buildMobaHud(stage, { displayName: display, role });

    // Hook match end
    const ctx = {
      botId, displayName: display, role,
      onHome: options.onHome,
      onMatchEnd(winner, world) {
        // Build scoreboard data
        function packActor(a) {
          return { name: a.name, role: a.role || '', stats: a.stats };
        }
        const data = {
          win: winner === 'player',
          draw: winner === 'draw',
          player:  packActor(world.player),
          allies:  world.allyBots.map(packActor),
          enemies: world.enemyBots.map(packActor),
          scores:  { player: world.score.player, enemy: world.score.enemy },
          onContinue() {
            if (typeof options.onExit === 'function') options.onExit();
            else if (typeof options.onHome === 'function') options.onHome();
          }
        };
        window.showVictoryScreen(stage, data);
      }
    };

    let sceneCtrl = null;
    try {
      if (use3D) {
        sceneCtrl = startThreeScene(canvas, ctx, hud);
      } else {
        sceneCtrl = start2DScene(canvas, display);
      }
    } catch (err) {
      console.error("[Game] 3D scene failed:", err);
      sceneCtrl = start2DScene(canvas, display);
    }

    setTimeout(() => {
      loadingOverlay.style.transition = "opacity 350ms";
      loadingOverlay.style.opacity = "0";
      setTimeout(() => loadingOverlay.remove(), 380);
    }, 600);

    return {
      stage,
      dispose() {
        sceneCtrl && sceneCtrl.dispose && sceneCtrl.dispose();
        hud.destroy();
      }
    };
  }

  window.FamiliarBotGame = { start };
})();
