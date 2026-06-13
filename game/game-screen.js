/**
 * FamiliarBot League — Game / Arena scene launcher (entry).
 *
 * Public API (UNCHANGED):
 *   FamiliarBotGame.start({ botId, displayName, role, onExit, onHome })
 *
 * index.html still only needs to include this file — the entry lazily
 * loads everything else (Three.js, arena, MOBA, sibling patch modules)
 * at startup, in dependency order.
 *
 * File layout:
 *
 *   game/game-screen.js   — entry / public API / module loading  (this file)
 *   game/game-roster.js   — fallback names + per-team roster picker
 *   game/game-world.js    — createWorld(): actors, combat, capture, XP, AI tick
 *   game/game-scene.js    — startThreeScene(): renderer, camera, player input, loop
 *
 *   PATCH MODULES (NEW, sibling to this file — loaded at startup in order):
 *     game/game-visuals.js        — kills shadows, brightens lighting, safe toon
 *     game/game-performance.js    — 2× battlefield, off-camera culling, back-face cull
 *     game/game-ui-layout.js      — clustered ability buttons + mobile-landscape fit
 *
 * The patch modules MUST load in this order:
 *
 *   1) game-performance.js  — must scale TERRAIN BEFORE arena scripts read it
 *   2) game-visuals.js      — applied to renderer + scene after they exist
 *   3) game-ui-layout.js    — applied to HUD overlay after HUD is built
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

  // NEW: sibling patch modules. Order matters — performance.js mutates the
  // TERRAIN config BEFORE the arena scripts read it, visuals.js needs the
  // renderer/scene from startMobaThreeScene, and ui-layout.js needs the
  // HUD DOM tree from buildMobaHud.
  const PATCH_SCRIPTS = [
    "./game-performance.js",
    "./game-visuals.js",
    "./game-ui-layout.js",
    "./game-input.js"
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

    // Mount inside the responsive scaler so the 844×390 design footprint
    // always fits the viewport (incl. mobile landscape) — the ui-layout
    // patch module fine-tunes the per-element sizing once it's loaded.
    if (window.FamiliarBotResponsive &&
        typeof window.FamiliarBotResponsive.mount === 'function') {
      window.FamiliarBotResponsive.mount(stage);
    }

    requestAnimationFrame(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });

    // ---- Module loading order ----
    //
    // 1) THREE.js (CDN) — every patch + arena script depends on it.
    let use3D = await ensureThree();

    // 2) Arena config FIRST (before the perf patch — the perf patch needs
    //    the TERRAIN global to exist so it can scale it).
    if (use3D) use3D = await ensureModules(["./arena/arena-config.js"]);

    // 3) Patch modules. Their script-side code only DEFINES helpers; the
    //    side effects happen when we call .scaleTerrain / .applyToScene /
    //    .applyToHud below.
    const patchReady = await ensureModules(PATCH_SCRIPTS);
    if (!patchReady) console.warn('[Game] patch modules failed to load');

    // 4) NOW scale the battlefield — must happen BEFORE the remaining
    //    arena scripts read TERRAIN so the GLB scaler, capture-point /
    //    spawn-pad builders, and CAPTURE_POINTS shim all see the 2×
    //    footprint.
    if (window.FamiliarBotGamePerformance) {
      window.FamiliarBotGamePerformance.scaleTerrain(2);
    }

    // 5) Remaining arena scripts (opal-battlefield, capture-points,
    //    spawn-pads, arena/index.js) + MOBA + game-* runtime.
    if (use3D) {
      use3D = await ensureModules(ARENA_SCRIPTS.slice(1));
    }
    const mobaReady = await ensureModules(MOBA_SCRIPTS);
    if (!mobaReady) console.warn('[Game] MOBA modules failed to load');
    const gameReady = await ensureModules(GAME_SCRIPTS);
    if (!gameReady) console.warn('[Game] game-* modules failed to load');

    // ---- Build HUD overlay ----
    const hud = window.buildMobaHud(stage, { displayName: display, role });

    // Apply the new clustered ability layout + mobile-landscape CSS.
    if (window.FamiliarBotGameUiLayout) {
      window.FamiliarBotGameUiLayout.applyToHud(hud, stage);
    }

    // Multi-touch input (Pokémon-Unite-style joystick + camera drag).
    // Must run AFTER buildMobaHud so the joystick DOM is available, and
    // after applyToHud so the layout CSS is in place.
    if (window.FamiliarBotInput) {
      window.FamiliarBotInput.attach(hud, stage);
    }

    // ---- Hook match end ----
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
            // After the victory / defeat / stalemate screen, send the
            // player back to the MAIN MENU (not the garage). Falls back
            // to onExit if no menu handler was wired up.
            if (typeof options.onHome === 'function') options.onHome();
            else if (typeof options.onExit === 'function') options.onExit();
          }
        };
        window.showVictoryScreen(stage, data);
      }
    };

    // ---- Start the actual Three.js scene ----
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

    // ---- Wire the visuals + performance patches into the live scene ----
    if (sceneCtrl && sceneCtrl.scene && sceneCtrl.camera && sceneCtrl.renderer) {
      if (window.FamiliarBotGameVisuals) {
        window.FamiliarBotGameVisuals.applyToScene(
          sceneCtrl.scene, sceneCtrl.renderer, { toon: false }
        );
        // Apply the toon shader after a beat so the GLB has had a chance
        // to attach its materials. Wrapped in try/catch so a shader-level
        // hiccup never crashes the game loop.
        setTimeout(() => {
          try { window.FamiliarBotGameVisuals.applyToon(sceneCtrl.scene, { verbose: false }); }
          catch (e) { console.warn('[Game] toon pass skipped:', e && e.message); }
        }, 1200);
        // Re-apply visuals once more after the GLB finishes loading (it
        // adds many meshes asynchronously). 3.5 s is generous but cheap.
        setTimeout(() => {
          try {
            window.FamiliarBotGameVisuals.applyToScene(
              sceneCtrl.scene, sceneCtrl.renderer, { toon: false }
            );
            window.FamiliarBotGameVisuals.applyToon(sceneCtrl.scene, { verbose: false });
          } catch (e) { /* noop */ }
        }, 3500);
      }
      if (window.FamiliarBotGamePerformance) {
        window.FamiliarBotGamePerformance.attachToWorld(
          sceneCtrl.scene, sceneCtrl.camera, sceneCtrl.world, sceneCtrl.vfx
        );
      }
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
