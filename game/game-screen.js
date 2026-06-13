/**
 * FamiliarBot League — Game / Arena scene launcher (entry).
 *
 * Public API (unchanged):
 *   FamiliarBotGame.start({ botId, displayName, role, onExit, onHome })
 *
 * This file used to contain the whole MOBA implementation (~1100 lines). It
 * has been split into focused modules; this file only wires them together:
 *
 *   game/game-screen.js   — entry / public API / module loading  (this file)
 *   game/game-roster.js   — fallback names + per-team roster picker
 *   game/game-world.js    — createWorld(): actors, combat, capture, XP, AI tick
 *   game/game-scene.js    — startThreeScene(): renderer, camera, player input, loop
 *
 * Music still routes through FamiliarBotAudio.play('game') so the arena
 * track keeps playing.
 */
(function () {
  const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

  // Arena modules. The visual base is loaded from `assets/opal_battlefield.glb`
  // via opal-battlefield.js. The remaining arena scripts cover gameplay
  // overlays that sit ON TOP of the GLB (capture points, spawn pads) plus
  // the shared TERRAIN constants & collision helpers.
  const ARENA_SCRIPTS = [
    "./arena/arena-config.js",
    "./arena/opal-battlefield.js",
    "./arena/capture-points.js",
    "./arena/spawn-pads.js",
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

  // Companion game-screen modules, loaded relative to THIS file so the
  // game-screen.js consumer doesn't have to update its <script> tags.
  const GAME_SCRIPTS = [
    "./game-roster.js",
    "./game-world.js",
    "./game-scene.js"
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

  // -------------------- Fallback 2D scene (kept tiny) -------------------
  function start2DScene(canvas, _botName) {
    const ctx = canvas.getContext("2d");
    let stopped = false;
    function tick() {
      if (stopped) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.fillStyle = '#0a1424'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c8eaff'; ctx.font = 'bold 14px Segoe UI, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('3D failed to load — please refresh.', w / 2, h / 2);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { dispose() { stopped = true; } };
  }

  // -------------------- public start() ----------------------------------
  async function start(options = {}) {
    const botId   = options.botId || "atlas";
    const display = options.displayName || (botId.charAt(0).toUpperCase() + botId.slice(1));
    const role    = options.role || "All-Rounder";

    if (window.FamiliarBotAudio) window.FamiliarBotAudio.play("game");

    document.body.innerHTML = "";
    document.body.classList.remove("familiarbot-menu-active", "familiarbot-garage-active");
    document.body.classList.add("familiarbot-game-active");

    const stage = document.createElement("div");
    stage.className = "game-stage";

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
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

    // Modules
    let use3D = await ensureThree();
    if (use3D) use3D = await ensureModules(ARENA_SCRIPTS);
    const mobaReady = await ensureModules(MOBA_SCRIPTS);
    if (!mobaReady) console.warn('[Game] MOBA modules failed to load');
    const gameReady = await ensureModules(GAME_SCRIPTS);
    if (!gameReady) console.warn('[Game] game-* modules failed to load');

    // Build HUD overlay
    const hud = window.buildMobaHud(stage, { displayName: display, role });

    // Hook match end
    const ctx = {
      botId, displayName: display, role,
      onHome: options.onHome,
      onMatchEnd(winner, world) {
        function packActor(a) {
          return { name: a.name, role: a.role || '', stats: a.stats };
        }
        const data = {
          win:   winner === 'player',
          draw:  winner === 'draw',
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
      if (use3D && typeof window.startMobaThreeScene === 'function') {
        sceneCtrl = window.startMobaThreeScene(canvas, ctx, hud);
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
