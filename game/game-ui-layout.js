/**
 * FamiliarBot League — UI layout patch module (sibling of game-screen.js).
 *
 * Two responsibilities:
 *
 *  1) Re-arrange the bottom-right ability cluster.
 *
 *     The legacy HUD lined every ability up in a single horizontal row:
 *        [EJECT][BASIC][P1][P2][UNITE]
 *
 *     The new layout (Pokémon-Unite style) clusters the powers AROUND the
 *     Basic Attack button:
 *
 *                            [UNITE]                 ↖ above basic
 *                  [P2]                              ↖ above p1
 *           [P1]          [BASIC]                    ← p1 left of basic;
 *                                                       basic is largest
 *           [EJECT]                                    ← side-of-cluster
 *
 *     This is implemented entirely via CSS overrides + targeted re-parenting
 *     in the existing `.moba-abilities` container (no HUD .js changes), so
 *     all callbacks (controls.onAbility('basic'|'p1'|'p2'|'unite'|'eject'))
 *     keep working unchanged.
 *
 *  2) Mobile-landscape responsive fit.
 *
 *     The user reports the game "seems bigger than my landscape screen"
 *     even though responsive-scene.js exists. The legacy 844 × 390 design
 *     footprint is wider than most phones at the same aspect ratio when
 *     accounting for the browser address bar; the scaler then has to clamp
 *     to the height and the side edges spill off. We:
 *       • inject a tighter mobile-landscape stylesheet
 *       • make the .game-stage / canvas honour the scaler's full footprint
 *       • compress the moba-top bar so the team portraits + timer fit
 *         within a narrow landscape viewport.
 *
 * Exposes (window):
 *   FamiliarBotGameUiLayout.applyToHud(hud, stage)
 *   FamiliarBotGameUiLayout.installResponsiveCss()
 */
(function (global) {
  const NS = {};

  const STYLE_ID = 'fb-game-ui-layout-style';
  const ABILITY_CSS = `
  /* ---- New clustered ability layout (Pokémon-Unite style) ---- */
  .game-stage .moba-abilities {
    /* Switch the rail from a flex-row to a positioned canvas so each
       button lives at fixed coordinates around the basic-attack hub. */
    position: absolute;
    right: 14px;
    bottom: 14px;
    width: 180px;
    height: 170px;
    display: block;
    gap: 0;
    pointer-events: none;     /* parent passes through; buttons re-enable */
  }
  .game-stage .moba-abilities .ab { pointer-events: auto; }
  .game-stage .moba-abilities .ab,
  .game-stage .moba-abilities .basic,
  .game-stage .moba-abilities .unite,
  .game-stage .moba-abilities .eject {
    position: absolute;
    margin: 0;
  }

  /* BASIC ATTACK — biggest, anchored at the bottom-right corner. */
  .game-stage .moba-abilities .basic {
    width: 84px; height: 84px;
    right: 0;  bottom: 0;
    border-width: 3px;
    box-shadow: 0 0 14px rgba(120,180,255,0.5);
    z-index: 3;
  }
  .game-stage .moba-abilities .basic .ic { font-size: 32px; }

  /* FIRST POWER — to the LEFT of basic, same vertical line. */
  .game-stage .moba-abilities .p1 {
    width: 60px; height: 60px;
    right: 96px;            /* basic-width(84) + 12px gap */
    bottom: 12px;
    z-index: 2;
  }
  .game-stage .moba-abilities .p1 .ic { font-size: 24px; }

  /* SECOND POWER — ABOVE the first power. */
  .game-stage .moba-abilities .p2 {
    width: 60px; height: 60px;
    right: 96px;
    bottom: 84px;           /* p1 bottom(12) + p1 height(60) + 12 gap */
    z-index: 2;
  }
  .game-stage .moba-abilities .p2 .ic { font-size: 24px; }

  /* UNITE — ABOVE basic attack. */
  .game-stage .moba-abilities .unite {
    width: 64px; height: 64px;
    right: 10px;
    bottom: 96px;           /* basic bottom(0) + basic height(84) + 12 gap */
    z-index: 3;
    font-size: 24px;
  }
  .game-stage .moba-abilities .unite .ic { font-size: 26px; }

  /* EJECT — small, to the LEFT of P1 (side of cluster). */
  .game-stage .moba-abilities .eject {
    width: 42px; height: 42px;
    right: 162px;           /* p1 right(96) + p1 width(60) + 6 gap */
    bottom: 22px;
    border-radius: 10px;
    z-index: 2;
  }

  /* Re-do the label placement so it doesn't overlap nearby buttons. */
  .game-stage .moba-abilities .ab .lbl {
    font-size: 7px;
    letter-spacing: 1px;
    bottom: -11px;
  }
  .game-stage .moba-abilities .basic .lbl { font-size: 8px; bottom: -12px; }
  .game-stage .moba-abilities .unite .lbl { font-size: 8px; bottom: -12px; }
  `;

  const RESPONSIVE_CSS = `
  /* ---- Multi-touch surface ----
     The whole stage owns its touches; the input patch decides which
     finger spawns the joystick (left half) and which one drags the
     camera (right half). */
  .game-stage { touch-action: none; -webkit-user-select: none; user-select: none; }
  .game-stage .moba-stick {
    /* Hidden by default — the input patch shows it under the user's
       finger on a left-half touch. The legacy fixed bottom-left dock
       is gone. */
    display: none !important;
    pointer-events: none;
    z-index: 5;
  }
  .game-stage .moba-stick.fb-active { display: flex !important; }
  /* Joystick arrows are noise once the ring spawns under the finger. */
  .game-stage .moba-stick .arrows { display: none; }

  /* ---- Mobile-landscape fit ----
     The responsive-scene.js scaler uses Math.min(sx,sy). On a narrow
     landscape phone (≈ 740×340 visible) the scaler under-uses the
     height. We let the body bg stay black and just confirm the stage
     fills the design footprint. */
  html, body { background: #000 !important; }

  /* Make the game-stage cover the entire fb-scaler so canvas + HUD never
     clip on a phone in landscape. */
  .fb-scaler > .game-stage,
  .fb-scaler > .game-scene {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
  }
  .familiarbot-game-active .game-stage {
    width: 844px;
    height: 390px;
  }

  /* Top bar width — keep it inside the 844 design footprint even at
     narrow landscape sizes (it was 720px before and that's fine, but
     enforce a max so portraits don't spill across the edges). */
  .game-stage .moba-top {
    width: min(720px, 92%);
  }

  /* Minimap a touch smaller so it doesn't eat the top-left corner on
     small phones. */
  @media (max-aspect-ratio: 16/9) {
    .game-stage .moba-minimap { width: 132px; height: 94px; }
  }

  /* Hide the dashed direction arrows inside the joystick on small screens;
     they were cramping the touch knob. */
  @media (max-height: 380px) {
    .game-stage .moba-stick .arrows { display: none; }
  }
  `;

  function installResponsiveCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = ABILITY_CSS + '\n' + RESPONSIVE_CSS;
    document.head.appendChild(s);
  }

  /**
   * Re-order the ability buttons so the cluster reads top-to-bottom /
   * right-to-left for screen readers and keyboard tab order. The CSS
   * positions them visually; this just re-orders the children.
   */
  function applyToHud(hud, stage) {
    installResponsiveCss();
    if (!stage) return;
    const rail = stage.querySelector('.moba-abilities');
    if (!rail) return;
    const order = ['unite', 'p2', 'p1', 'basic', 'eject'];
    order.forEach((id) => {
      const btn = rail.querySelector(`[data-ab="${id}"]`);
      if (btn) rail.appendChild(btn);
    });
    // Tag so a hot reload doesn't re-do the work.
    rail.dataset.fbLayout = 'cluster';
  }

  NS.installResponsiveCss = installResponsiveCss;
  NS.applyToHud           = applyToHud;
  global.FamiliarBotGameUiLayout = NS;
})(typeof window !== 'undefined' ? window : globalThis);
