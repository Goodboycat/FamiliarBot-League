/**
 * FamiliarBot League — Main Menu renderer.
 *
 * Reads `menu_screen.json` (the exported layout from the menu designer) and
 * renders every item as an absolutely-positioned <img> on top of the
 * background. Icon source files live either next to this script
 * (assets/ui/menu/) or in the shared icons folder (assets/ui/icons/).
 *
 * After the loading screen finishes, `FamiliarBotMainMenu.start()` is called.
 */
(function () {
  const defaultConfigPath = "./menu_screen.json";

  // Icon search order: 1) same folder as menu (menu/), 2) shared icons folder.
  // Tolerate both the original (typo) name `Menu_blackground.png` and the
  // canonical `Menu_background.png` by also probing icons/ for either.
  const ICON_SEARCH_FOLDERS = [
    "./",          // assets/ui/menu/
    "../icons/"    // assets/ui/icons/
  ];

  // Map of menu item assetRef → semantic id used for click routing.
  // (Matches the icon PNGs shipped in assets/ui/icons/.)
  const ICON_ACTIONS = {
    "mech_arena_button.png": "play",
    "mech_arena_label.png":  "play",
    "battle_type.png":       "battle_type",
    "customize.png":         "customize",
    "settings.png":          "settings",
    "home.png":              "home",
    "friends.png":           "friends",
    "missions.png":          "missions",
    "mail.png":              "mail",
    "rank.png":              "rank",
    "bond_badge.png":        "bond",
    "customization_scene.png": "customize",
    "plus.png":              "plus"
  };

  function resolvePath(path, basePath) {
    return new URL(path, new URL(basePath, window.location.href)).href;
  }

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

  /**
   * Resolve an assetRef (a bare PNG filename) against the configured search
   * folders. Returns the first URL that actually exists.
   *
   * Uses an <img> probe rather than fetch(HEAD) because many static hosts
   * (and file://) either disallow HEAD or return a non-ok status for it,
   * which previously caused every asset to fall back to the wrong folder.
   */
  function probeImage(url) {
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = url;
    });
  }

  async function resolveAssetUrl(assetRef, basePath) {
    for (const folder of ICON_SEARCH_FOLDERS) {
      const candidate = resolvePath(folder + assetRef, basePath);
      // eslint-disable-next-line no-await-in-loop
      if (await probeImage(candidate)) return candidate;
    }
    // Fallback: return the menu-folder path even if missing, so the broken
    // <img> is visible in dev tools rather than silently dropped.
    return resolvePath(ICON_SEARCH_FOLDERS[0] + assetRef, basePath);
  }

  /**
   * Build one <img> element from an items[] entry. The CSS file already has
   * `.item-N` rules that match the same index, so we just need the index +
   * the resolved src. We also write inline left/top/width/height so the
   * layout works even if the CSS file fails to load.
   */
  function buildItemImage(item, index, assetUrl, screenSize) {
    const img = document.createElement("img");
    img.className = `menu-item item-${index}`;
    img.src = assetUrl;
    img.alt = item.assetRef || `menu item ${index}`;
    img.draggable = false;

    // Inline fallback positioning derived directly from the JSON.
    // The designer exports x/y as top-left positions, so we must pin
    // transform-origin to top-left for EVERY item — even when scale === 1 —
    // otherwise rotation (or any later CSS) would pivot around the center
    // and visually shift the element.
    img.style.position = "absolute";
    img.style.left = `${item.x}px`;
    img.style.top = `${item.y}px`;
    img.style.transformOrigin = "top left";

    const transforms = [];
    if (typeof item.scale === "number" && item.scale !== 1) {
      transforms.push(`scale(${item.scale})`);
    }
    if (typeof item.rotation === "number" && item.rotation !== 0) {
      transforms.push(`rotate(${item.rotation}deg)`);
    }
    if (transforms.length) {
      img.style.transform = transforms.join(" ");
    }
    if (typeof item.zIndex === "number") {
      img.style.zIndex = String(item.zIndex);
    }

    // Only wire interactivity for items that are NOT locked. Locked items
    // (background, decorative labels, frames) should not show a pointer
    // cursor or dispatch click events even if they have an entry in
    // ICON_ACTIONS.
    // The big play CTA — `mech_arena_button.png` — is exported as
    // `isLocked: true` in the JSON (so the designer doesn't move it),
    // but we still want it to be clickable at runtime. Treat "play" /
    // "battle_type" / "customize" as always-clickable regardless of
    // the lock flag.
    const action = ICON_ACTIONS[item.assetRef];
    const ALWAYS_CLICKABLE = new Set(["play", "battle_type", "customize"]);
    const clickable = action && (item.isLocked === false || ALWAYS_CLICKABLE.has(action));

    if (clickable) {
      img.dataset.action = action;
      img.style.cursor = "pointer";
      img.style.pointerEvents = "auto";
      // touch-action: manipulation removes the 300ms tap delay on mobile
      // and prevents double-tap zoom from swallowing the click.
      img.style.touchAction = "manipulation";

      const dispatch = (ev) => {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        const event = new CustomEvent("familiarbot:menu-action", {
          detail: { action, assetRef: item.assetRef, item }
        });
        window.dispatchEvent(event);
        console.log(`[Menu] action: ${action} (${item.assetRef})`);
      };
      img.addEventListener("click", dispatch);
      // Also listen for pointerup so taps register reliably on touch
      // screens even if the browser fails to synthesise a click event
      // (which can happen when a scroll/zoom gesture is partially detected).
      img.addEventListener("pointerup", (ev) => {
        if (ev.pointerType === "touch") dispatch(ev);
      });
    } else if (item.isLocked === false) {
      // Unlocked but unmapped — still hint that it's interactive.
      img.style.cursor = "pointer";
    } else {
      // Locked decorative items (background, character, frames, labels)
      // must NEVER intercept pointer events — otherwise they can sit on
      // top of the unite button and silently swallow taps because the
      // PNG transparency is opaque to the hit-test.
      img.style.pointerEvents = "none";
    }

    return img;
  }

  async function start(options = {}) {
    const configPath = options.configPath || defaultConfigPath;
    const config = await fetchJson(configPath);
    const screenSize = config.screenSize || { width: 844, height: 390 };

    // Switch background music to the menu track.
    if (window.FamiliarBotAudio) {
      window.FamiliarBotAudio.play("menu");
    }

    // Resolve every asset URL up-front (parallel).
    const items = config.items || [];
    const urls = await Promise.all(
      items.map((item) => resolveAssetUrl(item.assetRef, configPath))
    );

    // Reset the body (was showing the loading screen) and prepare for
    // the menu. The responsive helper owns the .fb-viewport / .fb-scaler
    // wrapper that scales the 844x390 design footprint to any device.
    if (window.FamiliarBotResponsive) {
      window.FamiliarBotResponsive.reset();
    } else {
      document.body.innerHTML = "";
    }
    document.body.classList.remove("familiarbot-garage-active");
    document.body.classList.add("familiarbot-menu-active");

    const scene = document.createElement("div");
    scene.className = "game-scene main-menu-scene";
    scene.style.position = "relative";
    scene.style.width = `${screenSize.width}px`;
    scene.style.height = `${screenSize.height}px`;
    scene.style.margin = "0";
    scene.style.overflow = "hidden";

    items.forEach((item, index) => {
      scene.appendChild(buildItemImage(item, index, urls[index], screenSize));
    });

    if (window.FamiliarBotResponsive) {
      window.FamiliarBotResponsive.mount(scene);
    } else {
      document.body.appendChild(scene);
    }

    // Wire the "play" action to whatever caller passed in (typically the
    // garage launcher). We attach this only once per start() — listeners
    // from a previous run are GC'd when document.body.innerHTML is reset.
    const handler = (ev) => {
      const action = ev.detail && ev.detail.action;
      if (action === "play" && typeof options.onPlay === "function") {
        options.onPlay(ev.detail);
      } else if (typeof options.onAction === "function") {
        options.onAction(ev.detail);
      }
    };
    window.addEventListener("familiarbot:menu-action", handler);
    scene.__menuActionHandler = handler;

    if (typeof options.onReady === "function") {
      options.onReady(scene);
    }

    return scene;
  }

  window.FamiliarBotMainMenu = { start };
})();
