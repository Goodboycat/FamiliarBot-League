/**
 * FamiliarBot League — Game / Arena scene launcher.
 *
 * Builds a self-contained 3D arena view inside the same 844x390 stage the
 * rest of the UI uses, then plays the arena music track.
 *
 *   FamiliarBotGame.start({
 *     botId:       "atlas",
 *     displayName: "Atlas",          // optional — defaults derived from botId
 *     role:        "All-Rounder",
 *     onExit()    { ... },            // user clicked "← GARAGE"
 *     onHome()    { ... }             // user clicked "MENU"
 *   });
 *
 * If THREE.js is available globally, we render the proper opal-plane arena
 * via the existing modules (`game/arena/*.js`).
 * If THREE is not loaded, we lazy-load it from a CDN; if that also fails
 * (offline / blocked), we fall back to a 2D canvas top-down arena so the
 * game scene still works and the player can return to the garage.
 */
(function () {
  const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  const ARENA_SCRIPTS = [
    "./arena/arena-config.js",
    "./arena/floor.js",
    "./arena/walls.js",
    "./arena/pillars.js",
    "./arena/capture-points.js",
    "./arena/spawn-pads.js",
    "./arena/altar.js",
    "./arena/index.js"
  ];

  // Resolve URLs relative to THIS script — works whether the page lives
  // at the project root (index.html) or in a sub-folder.
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
    try {
      await loadScript(THREE_CDN);
      return typeof window.THREE !== "undefined";
    } catch (err) {
      console.warn("[Game] THREE.js failed to load — falling back to 2D:", err.message);
      return false;
    }
  }

  async function ensureArenaModules() {
    for (const path of ARENA_SCRIPTS) {
      try {
        await loadScript(resolve(path));
      } catch (err) {
        console.warn("[Game] Failed to load arena module", path, err.message);
        return false;
      }
    }
    return typeof window.buildTerrain === "function";
  }

  // -------------------- 3D scene (THREE.js + arena modules) -------------
  function startThreeScene(canvas) {
    const THREE = window.THREE;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07101c);
    scene.fog = new THREE.FogExp2(0x07101c, 0.009);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 800);
    camera.position.set(0, 60, 100);
    camera.lookAt(0, 0, 0);

    let arena;
    try {
      arena = window.buildTerrain(scene);
    } catch (err) {
      console.warn("[Game] buildTerrain failed:", err);
    }

    // A floating placeholder bot in the middle of the arena.
    const bot = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(2.2, 3.4, 1.6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4a87b8, metalness: 0.55, roughness: 0.45,
      emissive: 0x103040, emissiveIntensity: 0.4
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.2;
    bot.add(body);

    const headGeo = new THREE.BoxGeometry(1.2, 1.0, 1.0);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x5fa8d8, emissive: 0x39f5ff, emissiveIntensity: 0.8
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 4.4;
    bot.add(head);

    const coreLight = new THREE.PointLight(0x39f5ff, 1.2, 14);
    coreLight.position.set(0, 3.2, 0);
    bot.add(coreLight);

    bot.position.set(-60, 0, 0); // player base side
    scene.add(bot);

    // Orbit-ish auto camera (no controls dependency).
    let t = 0;
    let stopped = false;
    let lastTs = performance.now();

    function tick(now) {
      if (stopped) return;
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      t += dt;
      if (arena && typeof arena.update === "function") arena.update(dt);

      // bob the bot
      bot.position.y = Math.sin(t * 2.2) * 0.6;
      bot.rotation.y = Math.sin(t * 0.6) * 0.5;

      // slowly orbit the camera around the arena
      const r = 110;
      camera.position.x = Math.cos(t * 0.12) * r;
      camera.position.z = Math.sin(t * 0.12) * r;
      camera.position.y = 55 + Math.sin(t * 0.25) * 8;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function dispose() {
      stopped = true;
      renderer.dispose();
    }
    return { dispose };
  }

  // -------------------- Fallback 2D scene -------------------------------
  function start2DScene(canvas, botName) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    let t = 0;
    let stopped = false;
    let lastTs = performance.now();

    function tick(now) {
      if (stopped) return;
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      t += dt;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Sky/void background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "#0a1424");
      skyGrad.addColorStop(1, "#06090f");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Arena floor (perspective-style ellipse)
      const cx = w / 2;
      const cy = h * 0.62;
      ctx.fillStyle = "#b2a98a";
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d6b066";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Center line
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.18);
      ctx.lineTo(cx, cy + h * 0.18);
      ctx.stroke();

      // Capture points (5 per side)
      for (let i = 0; i < 5; i++) {
        const dx = -w * 0.30 + (i % 3) * w * 0.05;
        const dy = -h * 0.10 + Math.floor(i / 3) * h * 0.10;
        ctx.fillStyle = "#4cb3ff";
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 4 + Math.sin(t * 3 + i) * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff5577";
        ctx.beginPath();
        ctx.arc(cx - dx, cy + dy, 4 + Math.cos(t * 3 + i) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player bot (left side)
      const px = cx - w * 0.30 + Math.sin(t * 1.4) * 4;
      const py = cy + Math.cos(t * 1.4) * 3;
      ctx.fillStyle = "#39f5ff";
      ctx.shadowColor = "#39f5ff";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Enemy bots (right side, 2)
      ctx.fillStyle = "#ff5577";
      ctx.shadowColor = "#ff5577";
      ctx.shadowBlur = 12;
      [0, 1].forEach((i) => {
        const ex = cx + w * 0.25 + Math.sin(t * 1.1 + i) * 6;
        const ey = cy + (i === 0 ? -8 : 8) + Math.cos(t * 1.1 + i) * 3;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = "rgba(200,234,255,0.85)";
      ctx.font = "bold 11px Segoe UI, Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${(botName || "Bot").toUpperCase()} — 2D fallback view`, cx, h - 24);

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

    // Switch music to arena/game track.
    if (window.FamiliarBotAudio) {
      window.FamiliarBotAudio.play("game");
    }

    document.body.innerHTML = "";
    document.body.classList.remove("familiarbot-menu-active", "familiarbot-garage-active");
    document.body.classList.add("familiarbot-game-active");

    const stage = document.createElement("div");
    stage.className = "game-stage";

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    stage.appendChild(canvas);

    // HUD overlay
    const hud = document.createElement("div");
    hud.className = "game-hud";
    hud.innerHTML = `
      <div class="game-hud-top">
        <div class="game-hud-bot">
          <span class="game-hud-bot-name">${display.toUpperCase()}</span>
          <span class="game-hud-bot-role">${role}</span>
        </div>
        <div class="game-hud-buttons">
          <button class="game-hud-button" data-action="garage">← GARAGE</button>
          <button class="game-hud-button" data-action="home">MENU</button>
          <button class="game-hud-button" data-action="mute" title="Toggle music">🔊</button>
        </div>
      </div>
      <div class="game-hud-banner">DEPLOYED</div>
      <div class="game-hud-bottom">
        <span class="game-hud-tip">SKY RUINS — Opal Plane Arena</span>
        <span class="game-hud-tip">FamiliarBot League</span>
      </div>
    `;
    stage.appendChild(hud);

    // Loading overlay (shown until renderer is up)
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "game-loading-overlay";
    loadingOverlay.innerHTML = `<div class="spinner"></div><div>ENTERING ARENA</div>`;
    stage.appendChild(loadingOverlay);

    document.body.appendChild(stage);

    // Wire HUD buttons
    hud.querySelector('[data-action="garage"]').addEventListener("click", () => {
      sceneCtrl && sceneCtrl.dispose && sceneCtrl.dispose();
      if (typeof options.onExit === "function") options.onExit();
      else window.dispatchEvent(new CustomEvent("familiarbot:game-exit"));
    });
    hud.querySelector('[data-action="home"]').addEventListener("click", () => {
      sceneCtrl && sceneCtrl.dispose && sceneCtrl.dispose();
      if (typeof options.onHome === "function") options.onHome();
      else window.dispatchEvent(new CustomEvent("familiarbot:game-home"));
    });
    const muteBtn = hud.querySelector('[data-action="mute"]');
    muteBtn.addEventListener("click", () => {
      if (!window.FamiliarBotAudio) return;
      const muted = window.FamiliarBotAudio.toggleMute();
      muteBtn.textContent = muted ? "🔈" : "🔊";
    });

    // Make canvas the right pixel size
    requestAnimationFrame(() => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });

    // Try the proper 3D scene first; fall back to 2D if that fails.
    let sceneCtrl = null;
    let use3D = await ensureThree();
    if (use3D) {
      use3D = await ensureArenaModules();
    }

    try {
      if (use3D) {
        sceneCtrl = startThreeScene(canvas);
      } else {
        sceneCtrl = start2DScene(canvas, display);
      }
    } catch (err) {
      console.warn("[Game] 3D scene failed, using 2D fallback:", err);
      sceneCtrl = start2DScene(canvas, display);
    }

    // Hide the loading overlay shortly after first frame
    setTimeout(() => {
      loadingOverlay.style.transition = "opacity 350ms";
      loadingOverlay.style.opacity = "0";
      setTimeout(() => loadingOverlay.remove(), 380);
    }, 600);

    return { stage, dispose() { sceneCtrl && sceneCtrl.dispose && sceneCtrl.dispose(); } };
  }

  window.FamiliarBotGame = { start };
})();
