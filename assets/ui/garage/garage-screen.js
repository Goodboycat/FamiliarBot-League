/**
 * FamiliarBot League — Garage screen renderer.
 *
 * Loads `garage_screen.json` (the roster + stats config), builds a
 * three-column hangar layout (bot list / stage / stats), and exposes:
 *
 *   FamiliarBotGarage.start({
 *     configPath:  "./garage_screen.json",
 *     selectedBotId: "atlas",          // optional initial pick
 *     onBack()        { ... },         // user clicked "Main Menu"
 *     onDeploy(botId) { ... }          // user clicked "Deploy"
 *   });
 *
 * It also tells the global audio manager (if present) to switch to the
 * "garage" track so the right music plays automatically.
 */
(function () {
  const defaultConfigPath = "./garage_screen.json";

  async function fetchJson(path) {
    if (window.FamiliarBotAssetCache) {
      return window.FamiliarBotAssetCache.fetchJson(path);
    }
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  function buildMech() {
    // Pure-CSS mech silhouette so the garage works even when GLB models
    // have not been preloaded yet. We just build the DOM skeleton; CSS does
    // the painting and the float animation.
    const mech = document.createElement("div");
    mech.className = "garage-mech";
    mech.innerHTML = `
      <div class="garage-mech-head"></div>
      <div class="garage-mech-torso"></div>
      <div class="garage-mech-arm left"></div>
      <div class="garage-mech-arm right"></div>
      <div class="garage-mech-leg left"></div>
      <div class="garage-mech-leg right"></div>
    `;
    return mech;
  }

  function buildStatsPanel(config) {
    const panel = document.createElement("div");
    panel.className = "garage-stats";

    const title = document.createElement("div");
    title.className = "garage-stats-title";
    title.textContent = "STATS";
    panel.appendChild(title);

    const stats = (config.panels && config.panels.stats) || [];
    stats.forEach((stat) => {
      const row = document.createElement("div");
      row.className = "garage-stat";
      row.dataset.statKey = stat.key;
      row.dataset.statMax = String(stat.max || 100);

      const label = document.createElement("div");
      label.className = "garage-stat-label";
      label.textContent = stat.label;

      const track = document.createElement("div");
      track.className = "garage-stat-track";
      const fill = document.createElement("div");
      fill.className = "garage-stat-fill";
      fill.style.width = "0%";
      track.appendChild(fill);

      const value = document.createElement("div");
      value.className = "garage-stat-value";
      value.textContent = "0";

      row.append(label, track, value);
      panel.appendChild(row);
    });

    return panel;
  }

  function updateStats(panel, statsForBot, config) {
    const defs = (config.panels && config.panels.stats) || [];
    defs.forEach((stat) => {
      const row = panel.querySelector(`.garage-stat[data-stat-key="${stat.key}"]`);
      if (!row) return;
      const v = (statsForBot && typeof statsForBot[stat.key] === "number") ? statsForBot[stat.key] : 0;
      const max = Number(row.dataset.statMax) || 100;
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      row.querySelector(".garage-stat-fill").style.width = `${pct}%`;
      row.querySelector(".garage-stat-value").textContent = String(Math.round(v));
    });
  }

  async function start(options = {}) {
    const configPath = options.configPath || defaultConfigPath;
    const config = await fetchJson(configPath);

    const screenSize = config.screenSize || { width: 844, height: 390 };
    const labels = config.labels || {};
    const bots = config.bots || [];
    const botStats = config.botStats || {};
    let selectedId = options.selectedBotId || config.defaultBotId || (bots[0] && bots[0].id);

    // Switch background track to the garage music (if the audio manager
    // is loaded). Safe to call multiple times — it no-ops if same track.
    if (window.FamiliarBotAudio) {
      window.FamiliarBotAudio.play("garage");
    }

    // Replace whatever was on the page (menu) with the garage scene.
    // Use the shared responsive scaler so the garage also adapts to
    // mobile and desktop viewports.
    if (window.FamiliarBotResponsive) {
      window.FamiliarBotResponsive.reset();
    } else {
      document.body.innerHTML = "";
    }
    document.body.classList.remove("familiarbot-menu-active");
    document.body.classList.add("familiarbot-garage-active");

    const scene = document.createElement("div");
    scene.className = "garage-scene";
    scene.style.width = `${screenSize.width}px`;
    scene.style.height = `${screenSize.height}px`;

    // Animated grid floor
    const grid = document.createElement("div");
    grid.className = "garage-grid";
    scene.appendChild(grid);

    // ---- Title bar ----
    const titlebar = document.createElement("div");
    titlebar.className = "garage-titlebar";

    const titleBlock = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "garage-title";
    titleEl.textContent = labels.title || "GARAGE";
    const subEl = document.createElement("div");
    subEl.className = "garage-subtitle";
    subEl.textContent = labels.subtitle || "Select your FamiliarBot";
    titleBlock.append(titleEl, subEl);

    const titleRight = document.createElement("div");
    const backBtn = document.createElement("button");
    backBtn.className = "garage-back";
    backBtn.type = "button";
    backBtn.textContent = labels.backButton || "← MAIN MENU";
    backBtn.addEventListener("click", () => {
      if (typeof options.onBack === "function") {
        options.onBack();
      } else {
        window.dispatchEvent(new CustomEvent("familiarbot:garage-back"));
      }
    });
    const muteBtn = document.createElement("button");
    muteBtn.className = "garage-audio-toggle";
    muteBtn.type = "button";
    muteBtn.title = "Toggle music";
    muteBtn.textContent = "🔊";
    muteBtn.addEventListener("click", () => {
      if (!window.FamiliarBotAudio) return;
      const muted = window.FamiliarBotAudio.toggleMute();
      muteBtn.textContent = muted ? "🔈" : "🔊";
    });
    titleRight.append(backBtn, muteBtn);

    titlebar.append(titleBlock, titleRight);
    scene.appendChild(titlebar);

    // ---- Roster (left) ----
    const roster = document.createElement("div");
    roster.className = "garage-roster";
    bots.forEach((bot) => {
      const row = document.createElement("div");
      row.className = "garage-bot";
      row.dataset.botId = bot.id;
      row.innerHTML = `
        <div class="garage-bot-thumb"></div>
        <div class="garage-bot-text">
          <span class="garage-bot-name">${bot.displayName || bot.id}</span>
          <span class="garage-bot-role">${bot.role || ""}</span>
        </div>
      `;
      row.addEventListener("click", () => selectBot(bot.id));
      roster.appendChild(row);
    });
    scene.appendChild(roster);

    // ---- Stage (center) ----
    const stage = document.createElement("div");
    stage.className = "garage-stage";

    const figure = document.createElement("div");
    figure.className = "garage-bot-figure";
    figure.appendChild(buildMech());
    stage.appendChild(figure);

    const podium = document.createElement("div");
    podium.className = "garage-podium";
    stage.appendChild(podium);

    const label = document.createElement("div");
    label.className = "garage-bot-label";
    label.innerHTML = `<div class="name"></div><div class="role"></div>`;
    stage.appendChild(label);

    scene.appendChild(stage);

    // ---- Stats panel (right) ----
    const statsPanel = buildStatsPanel(config);
    scene.appendChild(statsPanel);

    // ---- Deploy button (bottom) ----
    const deployBar = document.createElement("div");
    deployBar.className = "garage-deploy-bar";
    const deployWrap = document.createElement("div");
    deployWrap.className = "garage-deploy-wrap";
    const deployBtn = document.createElement("button");
    deployBtn.type = "button";
    deployBtn.className = "garage-deploy";
    deployBtn.textContent = labels.deployButton || "DEPLOY";
    const deploySub = document.createElement("div");
    deploySub.className = "garage-deploy-sub";
    deploySub.textContent = labels.deploySubLabel || "Enter the Arena";
    deployBtn.addEventListener("click", () => {
      console.log(`[Garage] Deploying with bot: ${selectedId}`);
      if (typeof options.onDeploy === "function") {
        options.onDeploy(selectedId, { config });
      } else {
        window.dispatchEvent(new CustomEvent("familiarbot:garage-deploy", {
          detail: { botId: selectedId }
        }));
      }
    });
    deployWrap.append(deployBtn, deploySub);
    deployBar.appendChild(deployWrap);
    scene.appendChild(deployBar);

    if (window.FamiliarBotResponsive) {
      window.FamiliarBotResponsive.mount(scene);
    } else {
      document.body.appendChild(scene);
    }

    // ---- Selection logic ----
    function selectBot(id) {
      const bot = bots.find((b) => b.id === id) || bots[0];
      if (!bot) return;
      selectedId = bot.id;

      roster.querySelectorAll(".garage-bot").forEach((el) => {
        el.classList.toggle("is-selected", el.dataset.botId === bot.id);
      });

      label.querySelector(".name").textContent = (bot.displayName || bot.id).toUpperCase();
      label.querySelector(".role").textContent = bot.role || "";

      updateStats(statsPanel, botStats[bot.id], config);

      // Cheap "swap" animation: flash the figure.
      figure.style.animation = "none";
      // force reflow so the animation restarts
      // eslint-disable-next-line no-unused-expressions
      figure.offsetWidth;
      figure.style.animation = "";

      window.dispatchEvent(new CustomEvent("familiarbot:garage-select", {
        detail: { botId: bot.id }
      }));
    }

    selectBot(selectedId);

    if (typeof options.onReady === "function") {
      options.onReady(scene);
    }

    return {
      scene,
      get selectedBotId() { return selectedId; },
      selectBot
    };
  }

  window.FamiliarBotGarage = { start };
})();
