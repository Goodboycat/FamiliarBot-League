/**
 * FamiliarBot League — HUD (DOM overlay).
 *
 * Replicates the UI seen in the reference screenshot, minus the team total-score
 * digits the user said to drop:
 *   • Top bar: 4 ally icons | timer | 4 enemy icons      (✓ — required)
 *   • Top-left minimap with FPS counter                  (✓)
 *   • Top-right: menu + settings icon                    (✓)
 *   • Right rail: hand / shield / flag / chat ping btns  (✓)
 *   • Bottom-left: virtual joystick + To Base recall     (✓)
 *   • Bottom-right: Basic Attack, First Power,
 *     Second Power, Unite Move, Eject Button             (✓)
 *   • Center: "Defending our goal zone!" chat banner     (✓)
 *   • Player nameplate over the world space              (handled in main loop)
 *
 * NB: every interactive element calls back through hud.controls.* hooks so
 *     the main game-screen runtime can wire them to the world.
 */
(function (global) {

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls)  e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildHud(stage, opts) {
    opts = opts || {};
    const display = opts.displayName || 'MechaX';
    const role    = opts.role || 'All-Rounder';

    const root = el('div', 'moba-hud');
    stage.appendChild(root);

    // -------- TOP BAR (team icons, timer, menus) --------
    const top = el('div', 'moba-top');
    root.appendChild(top);

    const allyIcons = el('div', 'moba-team-icons left');
    const enemyIcons = el('div', 'moba-team-icons right');
    const timerWrap = el('div', 'moba-timer-wrap',
      `<div class="moba-timer">10:00</div>`);
    const rightHud = el('div', 'moba-right-hud',
      `<button class="moba-icon" data-act="menu" title="Menu">≡</button>
       <button class="moba-icon" data-act="settings" title="Settings">⚙</button>`);

    top.appendChild(allyIcons);
    top.appendChild(timerWrap);
    top.appendChild(enemyIcons);
    top.appendChild(rightHud);

    // populate 4 ally + 4 enemy slots (player is shown separately in nameplate)
    const allyEls = [], enemyEls = [];
    for (let i = 0; i < 4; i++) {
      const a = el('div', 'moba-portrait ally', `<span>${i+1}</span><div class="hp"><i></i></div>`);
      const e = el('div', 'moba-portrait enemy', `<span>${i+1}</span><div class="hp"><i></i></div>`);
      allyIcons.appendChild(a); allyEls.push(a);
      enemyIcons.appendChild(e); enemyEls.push(e);
    }

    // -------- MINIMAP + FPS --------
    const mini = el('div', 'moba-minimap', `<canvas></canvas><div class="moba-fps">FPS: 60</div>`);
    root.appendChild(mini);
    const miniCanvas = mini.querySelector('canvas');
    miniCanvas.width = 156; miniCanvas.height = 110;
    const miniCtx = miniCanvas.getContext('2d');
    const fpsEl   = mini.querySelector('.moba-fps');

    // -------- CHAT/PING BANNER (center top) --------
    const banner = el('div', 'moba-banner',
      `<div class="who"><span class="dot"></span><span class="name">Nova</span></div>
       <div class="msg">Defending our goal zone!</div>`);
    root.appendChild(banner);
    banner.style.opacity = 0;

    function showBanner(name, msg) {
      banner.querySelector('.name').textContent = name;
      banner.querySelector('.msg').textContent = msg;
      banner.style.opacity = 1;
      clearTimeout(banner._t);
      banner._t = setTimeout(() => { banner.style.opacity = 0; }, 3000);
    }

    // -------- RIGHT RAIL (signal buttons) --------
    const rail = el('div', 'moba-rail',
      `<button data-sig="help"   class="moba-sig" title="Need help">✋</button>
       <button data-sig="defend" class="moba-sig" title="Defend">🛡</button>
       <button data-sig="attack" class="moba-sig" title="Attack here">🚩</button>
       <button data-sig="chat"   class="moba-sig" title="Open chat">💬</button>`);
    root.appendChild(rail);

    // -------- BOTTOM LEFT: joystick + To-Base --------
    const stickWrap = el('div', 'moba-stick',
      `<div class="ring"></div>
       <div class="arrows">
         <span class="up">▲</span><span class="dn">▼</span>
         <span class="lf">◀</span><span class="rt">▶</span>
       </div>
       <div class="knob"></div>`);
    root.appendChild(stickWrap);

    const toBase = el('button', 'moba-recall',
      `<div class="ic">⤴</div><div class="lbl">TO BASE</div>`);
    root.appendChild(toBase);

    // -------- BOTTOM RIGHT: abilities --------
    const abilityRail = el('div', 'moba-abilities',
      `<div class="ab eject" data-ab="eject">
         <div class="ring"></div>
         <div class="num"><span class="cur">12</span><span class="slash">/</span><span class="max">30</span></div>
         <div class="lbl">EJECT</div>
       </div>
       <div class="ab basic" data-ab="basic">
         <div class="ring"></div>
         <div class="ic">⚔</div>
         <div class="lbl">BASIC ATTACK</div>
       </div>
       <div class="ab p1" data-ab="p1">
         <div class="ring"></div>
         <div class="ic"></div>
         <div class="lbl">FIRST POWER</div>
         <div class="cd"></div>
         <div class="lvl">Lv1</div>
       </div>
       <div class="ab p2" data-ab="p2">
         <div class="ring"></div>
         <div class="ic"></div>
         <div class="lbl">SECOND POWER</div>
         <div class="cd"></div>
         <div class="lvl">Lv1</div>
       </div>
       <div class="ab unite" data-ab="unite">
         <div class="ring"></div>
         <div class="ic">✸</div>
         <div class="lbl">UNITE MOVE</div>
         <div class="cd"></div>
       </div>`);
    root.appendChild(abilityRail);

    // -------- LEVEL / XP READOUT --------
    const xpBar = el('div', 'moba-xp',
      `<div class="lvl">Lv <span class="n">1</span></div>
       <div class="bar"><i></i></div>`);
    root.appendChild(xpBar);

    // -------- KILL FEED --------
    const feed = el('div', 'moba-feed');
    root.appendChild(feed);
    function pushKill(text, color) {
      const row = el('div', 'moba-feed-row');
      row.style.color = color || '#fff';
      row.textContent = text;
      feed.appendChild(row);
      setTimeout(() => row.classList.add('fade'), 2500);
      setTimeout(() => row.remove(), 3500);
    }

    // -------- POWER PICKER MODAL --------
    const picker = el('div', 'moba-picker hidden',
      `<div class="ttl">CHOOSE A NEW POWER</div>
       <div class="sub">Lv <span class="lv">3</span> — Pick 1 of 3</div>
       <div class="opts"></div>
       <div class="hint">You can only carry 2 powers — picking a 3rd will replace one.</div>`);
    root.appendChild(picker);

    function showPowerPicker(level, options, onPick) {
      picker.querySelector('.lv').textContent = level;
      const optsHost = picker.querySelector('.opts');
      optsHost.innerHTML = '';
      options.forEach(p => {
        const c = el('div', 'opt');
        c.innerHTML = `<div class="oi" style="color:#${p.color.toString(16).padStart(6,'0')}">${p.icon}</div>
                       <div class="on">${p.name}</div>
                       <div class="od">${p.desc}</div>`;
        c.addEventListener('click', () => {
          picker.classList.add('hidden');
          onPick(p);
        });
        optsHost.appendChild(c);
      });
      picker.classList.remove('hidden');
    }

    // ---------- joystick interaction ----------
    const knob = stickWrap.querySelector('.knob');
    const stickState = { active: false, dx: 0, dy: 0 };
    let stickCenter = { x: 0, y: 0 };

    function stickStart(ev) {
      stickState.active = true;
      const r = stickWrap.getBoundingClientRect();
      stickCenter.x = r.left + r.width/2;
      stickCenter.y = r.top  + r.height/2;
      stickMove(ev);
      ev.preventDefault();
    }
    function stickMove(ev) {
      if (!stickState.active) return;
      const p = ev.touches ? ev.touches[0] : ev;
      const dx = p.clientX - stickCenter.x;
      const dy = p.clientY - stickCenter.y;
      const r = stickWrap.clientWidth / 2 - 12;
      const len = Math.sqrt(dx*dx + dy*dy);
      const cx = len > r ? dx / len * r : dx;
      const cy = len > r ? dy / len * r : dy;
      knob.style.transform = `translate(${cx}px, ${cy}px)`;
      stickState.dx = cx / r;
      stickState.dy = cy / r;
    }
    function stickEnd() {
      stickState.active = false;
      stickState.dx = 0; stickState.dy = 0;
      knob.style.transform = '';
    }
    // NOTE: When the FamiliarBotInput patch module is present it takes over
    // joystick + camera-drag input (Pokémon-Unite-style spawn-on-touch).
    // Keep the legacy listeners as a no-touch desktop fallback by binding
    // them only when the input patch is NOT installed.
    if (!global.FamiliarBotInput) {
      stickWrap.addEventListener('mousedown', stickStart);
      stickWrap.addEventListener('touchstart', stickStart, { passive: false });
      window.addEventListener('mousemove', stickMove);
      window.addEventListener('touchmove', stickMove, { passive: false });
      window.addEventListener('mouseup', stickEnd);
      window.addEventListener('touchend', stickEnd);
    }

    // ---------- ability buttons ----------
    const abilityBtns = abilityRail.querySelectorAll('.ab');
    const controls = {
      onAbility: () => {},
      onSignal:  () => {},
      onRecall:  () => {},
      onMenu:    () => {},
      onSettings:() => {}
    };
    abilityBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.ab;
        controls.onAbility(id);
      });
    });
    rail.querySelectorAll('.moba-sig').forEach(btn => {
      btn.addEventListener('click', () => controls.onSignal(btn.dataset.sig));
    });
    rightHud.querySelector('[data-act="menu"]').addEventListener('click',     () => controls.onMenu());
    rightHud.querySelector('[data-act="settings"]').addEventListener('click', () => controls.onSettings());
    toBase.addEventListener('click', () => controls.onRecall());

    // ---------- keyboard bindings ----------
    const keys = { w:false, a:false, s:false, d:false, up:false, down:false, left:false, right:false, q:false, e:false, r:false, space:false, f:false };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup')    keys.up = true;
      if (k === 's' || k === 'arrowdown')  keys.down = true;
      if (k === 'a' || k === 'arrowleft')  keys.left = true;
      if (k === 'd' || k === 'arrowright') keys.right = true;
      if (k === 'q') { keys.q = true; controls.onAbility('p1'); }
      if (k === 'e') { keys.e = true; controls.onAbility('p2'); }
      if (k === 'r') { keys.r = true; controls.onAbility('unite'); }
      if (k === ' ') { keys.space = true; controls.onAbility('basic'); e.preventDefault(); }
      if (k === 'f') { controls.onAbility('eject'); }
      if (k === 'b') { controls.onRecall(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup')    keys.up = false;
      if (k === 's' || k === 'arrowdown')  keys.down = false;
      if (k === 'a' || k === 'arrowleft')  keys.left = false;
      if (k === 'd' || k === 'arrowright') keys.right = false;
      if (k === 'q') keys.q = false;
      if (k === 'e') keys.e = false;
      if (k === 'r') keys.r = false;
      if (k === ' ') keys.space = false;
    });

    function getMoveVector() {
      // touch joystick wins if active
      if (stickState.active) return { x: stickState.dx, y: stickState.dy };
      let x = 0, y = 0;
      if (keys.up)    y -= 1;
      if (keys.down)  y += 1;
      if (keys.left)  x -= 1;
      if (keys.right) x += 1;
      const l = Math.sqrt(x*x + y*y);
      if (l > 1) { x /= l; y /= l; }
      return { x, y };
    }

    // ---------- timer ----------
    const timerEl = timerWrap.querySelector('.moba-timer');
    function setTimer(secLeft) {
      const m = Math.floor(secLeft / 60);
      const s = Math.floor(secLeft % 60).toString().padStart(2, '0');
      timerEl.textContent = `${m.toString().padStart(2,'0')}:${s}`;
      if (secLeft <= 120) timerEl.classList.add('urgent');
      else timerEl.classList.remove('urgent');
    }

    // ---------- ability slot state ----------
    function setAbilityIcon(slot, power) {
      const root = abilityRail.querySelector(`[data-ab="${slot}"] .ic`);
      const lbl  = abilityRail.querySelector(`[data-ab="${slot}"] .lbl`);
      if (!root) return;
      if (!power) {
        root.textContent = '?';
        if (lbl && slot === 'p1') lbl.textContent = 'FIRST POWER';
        if (lbl && slot === 'p2') lbl.textContent = 'SECOND POWER';
        return;
      }
      root.textContent = power.icon;
      root.style.color = '#' + power.color.toString(16).padStart(6,'0');
      if (lbl) lbl.textContent = power.name.toUpperCase();
    }
    function setAbilityCooldown(slot, pct) { // pct = 0..1 (1 = ready)
      const cd = abilityRail.querySelector(`[data-ab="${slot}"] .cd`);
      if (!cd) return;
      const p = Math.max(0, Math.min(1, 1 - pct));
      cd.style.background = `conic-gradient(rgba(0,0,0,0.6) ${p*360}deg, transparent 0deg)`;
    }
    function setAbilityLevel(slot, lvl) {
      const el2 = abilityRail.querySelector(`[data-ab="${slot}"] .lvl`);
      if (!el2) return;
      el2.textContent = 'Lv' + lvl;
    }
    function setEject(cur, max) {
      const root2 = abilityRail.querySelector('[data-ab="eject"]');
      if (!root2) return;
      root2.querySelector('.cur').textContent = cur;
      root2.querySelector('.max').textContent = max;
    }
    function setUniteReady(ready) {
      const u = abilityRail.querySelector('[data-ab="unite"]');
      if (!u) return;
      u.classList.toggle('ready', !!ready);
    }
    function setPortraitHp(side, idx, hp01) {
      const list = side === 'ally' ? allyEls : enemyEls;
      const el2 = list[idx];
      if (!el2) return;
      const bar = el2.querySelector('.hp i');
      if (bar) bar.style.width = (Math.max(0, Math.min(1, hp01)) * 100) + '%';
    }
    function setPortraitDead(side, idx, dead) {
      const list = side === 'ally' ? allyEls : enemyEls;
      const el2 = list[idx];
      if (!el2) return;
      el2.classList.toggle('dead', !!dead);
    }
    function setLevel(lvl, xp01) {
      xpBar.querySelector('.n').textContent = lvl;
      xpBar.querySelector('.bar i').style.width = (xp01*100).toFixed(1) + '%';
    }
    function setFps(fps) { fpsEl.textContent = 'FPS: ' + Math.round(fps); }

    function drawMinimap(world) {
      const c = miniCtx, cw = miniCanvas.width, ch = miniCanvas.height;
      c.clearRect(0,0,cw,ch);
      // BG
      const grd = c.createLinearGradient(0,0,cw,ch);
      grd.addColorStop(0,'rgba(10,20,40,0.85)');
      grd.addColorStop(1,'rgba(20,10,30,0.85)');
      c.fillStyle = grd;
      c.fillRect(0,0,cw,ch);
      c.strokeStyle = 'rgba(180,220,255,0.5)';
      c.strokeRect(0,0,cw,ch);

      // world goes -90..+90 X, -45..+45 Z
      const sx = cw / 180, sz = ch / 90;
      function W(x,z) { return [(x + 90) * sx, (z + 45) * sz]; }

      // capture points
      for (const cp of world.capturePoints) {
        if (!cp.alive) continue;
        const [x,y] = W(cp.x, cp.z);
        c.fillStyle =
          cp.owner === 'player' ? 'rgba(57,164,255,0.9)' :
          cp.owner === 'enemy'  ? 'rgba(255,80,110,0.9)' :
                                  'rgba(255,220,120,0.9)';
        c.beginPath(); c.arc(x, y, 4, 0, Math.PI*2); c.fill();
      }
      // bots
      function dot(actor, color) {
        if (!actor.alive) return;
        const [x,y] = W(actor.x, actor.z);
        c.fillStyle = color;
        c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI*2); c.fill();
      }
      world.allyBots.forEach(b => dot(b, '#7ad0ff'));
      // Fog-of-war: only draw spotted enemies on the minimap. The
      // performance patch flags each enemy with `._spotted` every frame.
      world.enemyBots.forEach(b => {
        if (b && b._spotted) dot(b, '#ff8898');
      });
      world.wildRobots.forEach(b => dot(b, '#c685ff'));
      world.bosses.forEach(b => dot(b, '#fff066'));
      if (world.megaBoss) dot(world.megaBoss, '#ff2244');
      if (world.player) {
        const [x,y] = W(world.player.x, world.player.z);
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#39f5ff';
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, 5, 0, Math.PI*2); c.stroke();
      }
    }

    function destroy() {
      root.remove();
    }

    return {
      root,
      controls,
      // setters / inputs
      getMoveVector,
      setTimer,
      setLevel,
      setEject,
      setUniteReady,
      setAbilityIcon,
      setAbilityCooldown,
      setAbilityLevel,
      setPortraitHp,
      setPortraitDead,
      setFps,
      drawMinimap,
      showBanner,
      pushKill,
      showPowerPicker,
      destroy
    };
  }

  global.buildMobaHud = buildHud;
})(typeof window !== 'undefined' ? window : globalThis);
