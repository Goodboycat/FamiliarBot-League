/**
 * FamiliarBot League — AI controllers.
 *
 * Lightweight goal-oriented controllers for:
 *   • Teammate bots (allied AI) — capture / fight / score
 *   • Enemy bots                 — same goals, opposite team
 *   • Wild robots                — wander, attack any nearby player on aggro
 *   • Bosses                     — guard their spawn, hit nearest enemy
 *
 * Each controller exposes `update(dt, world)`. `world` is the MOBA runtime,
 * which provides entity lists, capture points, and combat helpers.
 */
(function (global) {

  const THREE = () => global.THREE;
  const PI = Math.PI;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist2(a, b) { const dx=a.x-b.x, dz=a.z-b.z; return dx*dx + dz*dz; }
  function dist(a, b) { return Math.sqrt(dist2(a, b)); }

  function moveToward(self, tx, tz, dt, speed) {
    const dx = tx - self.x, dz = tz - self.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < 0.05) return false;
    const s = Math.min(speed * dt, d);
    self.x += dx / d * s;
    self.z += dz / d * s;
    self.facing = Math.atan2(dz, dx);
    return true;
  }

  function pickNearestEnemy(self, world) {
    let best = null, bd = Infinity;
    const enemies = (self.team === 'player') ? world.enemyBots : world.allyBots.concat(world.player ? [world.player] : []);
    for (const e of enemies) {
      if (!e.alive) continue;
      // Pokémon-Unite hide mechanic: actors inside a tall-grass bush are
      // invisible to enemies until they attack / take damage / leave.
      if (typeof world.isHiddenFrom === 'function' && world.isHiddenFrom(e, self)) continue;
      const d = dist2(self, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function pickNearbyCapturePoint(self, world) {
    // For an attacker: prefer enemy-owned circles. For a defender: own.
    const targets = world.capturePoints.filter(cp => cp.alive);
    if (!targets.length) return null;
    // For the player's allies, attack enemy or neutral circles first.
    const ownTeam = self.team;
    let best = null, bd = Infinity;
    for (const cp of targets) {
      if (cp.owner === ownTeam) continue; // already ours
      const d = dist2(self, cp);
      if (d < bd) { bd = d; best = cp; }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  function updateBot(self, dt, world) {
    if (!self.alive) {
      self.respawnTimer -= dt;
      if (self.respawnTimer <= 0) world.respawnBot(self);
      return;
    }

    // Combat: if an enemy is within sight, shoot.
    const enemy = pickNearestEnemy(self, world);
    const enemyClose = enemy && dist(self, enemy) < 16;

    if (enemy && enemyClose) {
      // Face them, shoot basic attack on cd.
      const dx = enemy.x - self.x, dz = enemy.z - self.z;
      self.facing = Math.atan2(dz, dx);
      // Keep some range
      if (dist(self, enemy) > 9) moveToward(self, enemy.x, enemy.z, dt, self.speed);
      self.basicCd -= dt;
      if (self.basicCd <= 0) {
        world.fireBasicAttack(self, enemy);
        self.basicCd = 1.0;
      }
      // Occasionally pop power
      self.powerCd -= dt;
      if (self.powerCd <= 0 && self.powers.length) {
        const power = self.powers[Math.floor(Math.random() * self.powers.length)];
        world.castPower(self, power, enemy);
        self.powerCd = 5 + Math.random()*4;
      }
      return;
    }

    // Otherwise, head to a capture point and "score".
    if (!self.targetCp || !self.targetCp.alive ||
        (self.targetCp.owner === self.team && self.targetCp.progress >= 1)) {
      self.targetCp = pickNearbyCapturePoint(self, world);
    }
    if (self.targetCp) {
      const t = self.targetCp;
      const arrived = !moveToward(self, t.x, t.z, dt, self.speed);
      if (dist(self, t) < t.radius + 0.5) {
        // Score on it
        world.captureProgress(t, self, dt * 0.18);
      }
      void arrived;
    } else {
      // wander
      self.wanderT = (self.wanderT || 0) - dt;
      if (self.wanderT <= 0) {
        self.wanderTx = self.x + (Math.random()-0.5) * 40;
        self.wanderTz = self.z + (Math.random()-0.5) * 30;
        self.wanderT = 2 + Math.random()*3;
      }
      moveToward(self, self.wanderTx || 0, self.wanderTz || 0, dt, self.speed * 0.6);
    }
  }

  // -------------------------------------------------------------------------
  function updateWildRobot(self, dt, world) {
    if (!self.alive) return;
    // Aggro on closest player/bot within range
    let nearest = null, bd = Infinity;
    const candidates = world.allyBots.concat(world.enemyBots);
    if (world.player) candidates.push(world.player);
    for (const c of candidates) {
      if (!c.alive) continue;
      const d = dist2(self, c);
      if (d < bd) { bd = d; nearest = c; }
    }
    if (nearest && bd < 64) { // aggro radius 8
      moveToward(self, nearest.x, nearest.z, dt, self.speed);
      self.basicCd -= dt;
      if (self.basicCd <= 0 && dist(self, nearest) < 3) {
        world.dealDamage(nearest, self, self.attack);
        self.basicCd = 1.2;
      }
    } else {
      // wander near spawn
      self.wanderT = (self.wanderT || 0) - dt;
      if (self.wanderT <= 0) {
        const a = Math.random() * Math.PI * 2;
        self.wanderTx = self.homeX + Math.cos(a) * 6;
        self.wanderTz = self.homeZ + Math.sin(a) * 6;
        self.wanderT = 2 + Math.random()*2;
      }
      moveToward(self, self.wanderTx || self.homeX, self.wanderTz || self.homeZ, dt, self.speed * 0.5);
    }
  }

  // -------------------------------------------------------------------------
  function updateBoss(self, dt, world) {
    if (!self.alive) return;
    let nearest = null, bd = Infinity;
    const candidates = world.allyBots.concat(world.enemyBots);
    if (world.player) candidates.push(world.player);
    for (const c of candidates) {
      if (!c.alive) continue;
      const d = dist2(self, c);
      if (d < bd) { bd = d; nearest = c; }
    }
    if (nearest && bd < 400) {
      moveToward(self, nearest.x, nearest.z, dt, self.speed);
      self.basicCd -= dt;
      if (self.basicCd <= 0 && dist(self, nearest) < 5) {
        world.dealDamage(nearest, self, self.attack);
        self.basicCd = 1.5;
      }
    }
  }

  global.MOBA_AI = { updateBot, updateWildRobot, updateBoss, moveToward, dist, dist2 };
})(typeof window !== 'undefined' ? window : globalThis);
