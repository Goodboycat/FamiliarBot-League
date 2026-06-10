(function () {
  const configPath = "./menu_screen.json";

  function resolvePath(path, basePath) {
    return new URL(path, new URL(basePath, window.location.href)).href;
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    return response.json();
  }

  function panelTemplate(id, config, manifest, weapons) {
    if (id === "play") {
      return `
        <p class="panel-kicker">Arena Ready</p>
        <h2 class="panel-title">${manifest.displayName}</h2>
        <p class="panel-copy">Choose your bot, swap weapons, and enter the arena after the loading screen has prepared every asset.</p>
        <div class="play-actions">
          <button class="primary-action" type="button">Start Match</button>
          <button class="secondary-action" type="button">Training</button>
        </div>
      `;
    }

    if (id === "weapons") {
      return `
        <p class="panel-kicker">Loadout</p>
        <h2 class="panel-title">Weapons</h2>
        <div class="weapon-grid">
          ${weapons.map((weapon) => `
            <article class="weapon-card">
              <h3>${weapon.displayName}</h3>
              <p>${weapon.type.replaceAll("_", " ")} · ${weapon.defaultSocket.replaceAll("_", " ")}</p>
            </article>
          `).join("")}
        </div>
      `;
    }

    if (id === "settings") {
      return `
        <p class="panel-kicker">Options</p>
        <h2 class="panel-title">Settings</h2>
        <div class="settings-row">
          <h3>Game Asset Loader</h3>
          <p>Loading screen, bot roster, weapons, powers, and loadouts are connected through game/game_assets.json.</p>
        </div>
      `;
    }

    return `
      <p class="panel-kicker">Roster</p>
      <h2 class="panel-title">Bots</h2>
      <div class="bot-grid">
        ${manifest.bots.map((bot) => `
          <article class="bot-card">
            <h3>${bot.displayName}</h3>
            <p>${bot.role.replaceAll("_", " ")} · ${bot.id}</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  function setActive(buttons, activeId) {
    buttons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.panel === activeId);
    });
  }

  async function start(options = {}) {
    const activeConfigPath = options.configPath || configPath;
    const config = await fetchJson(activeConfigPath);
    const manifestPath = resolvePath(config.gameManifest, activeConfigPath);
    const manifest = await fetchJson(manifestPath);
    const weapons = await fetchJson(resolvePath(manifest.weaponCatalog, manifestPath));

    document.body.innerHTML = `
      <main class="main-menu">
        <div class="menu-shell">
          <aside class="menu-nav">
            <div class="menu-brand">
              <h1>${manifest.displayName}</h1>
              <p>${manifest.bots.length} bots loaded from GitHub assets</p>
            </div>
            <nav class="menu-buttons" aria-label="Main menu">
              ${config.buttons.map((button) => `
                <button class="menu-button" type="button" data-panel="${button.id}">${button.label}</button>
              `).join("")}
            </nav>
            <div class="menu-footer">Assets linked through game manifest</div>
          </aside>
          <section class="menu-content">
            <div class="menu-panel"></div>
          </section>
        </div>
      </main>
    `;

    const panel = document.querySelector(".menu-panel");
    const buttons = [...document.querySelectorAll(".menu-button")];

    const showPanel = (id) => {
      panel.innerHTML = panelTemplate(id, config, manifest, weapons);
      setActive(buttons, id);
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => showPanel(button.dataset.panel));
    });

    showPanel(config.defaultPanel || "bots");
  }

  window.FamiliarBotMainMenu = { start };
})();
