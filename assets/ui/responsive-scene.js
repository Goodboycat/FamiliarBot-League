/**
 * FamiliarBot League — Responsive Scene Scaling
 *
 * Wraps any active scene in a fixed-size `.fb-scaler` element and applies
 * a CSS transform so the 844 x 390 design footprint always fits the
 * current viewport (works for mobile portrait, mobile landscape, tablets,
 * and desktop PCs).
 *
 * Usage (called automatically by menu / garage / game / loading screens):
 *
 *   FamiliarBotResponsive.mount(sceneEl);
 *
 * The helper will:
 *   1. Ensure a `.fb-viewport` and `.fb-scaler` wrapper exists on <body>.
 *   2. Reparent `sceneEl` into the scaler.
 *   3. Recompute the scale factor on resize / orientation change.
 *   4. Forward clicks reliably even after transform (the transform is on
 *      the wrapper, so child hitboxes stay aligned with what the user sees).
 */
(function () {
  const DESIGN_WIDTH = 844;
  const DESIGN_HEIGHT = 390;

  let viewportEl = null;
  let scalerEl = null;
  let resizeBound = false;

  function ensureWrappers() {
    if (viewportEl && scalerEl && document.body.contains(viewportEl)) {
      return { viewportEl, scalerEl };
    }

    viewportEl = document.querySelector(".fb-viewport");
    if (!viewportEl) {
      viewportEl = document.createElement("div");
      viewportEl.className = "fb-viewport";
      document.body.appendChild(viewportEl);
    }

    scalerEl = viewportEl.querySelector(".fb-scaler");
    if (!scalerEl) {
      scalerEl = document.createElement("div");
      scalerEl.className = "fb-scaler";
      viewportEl.appendChild(scalerEl);
    }

    if (!resizeBound) {
      window.addEventListener("resize", applyScale, { passive: true });
      window.addEventListener("orientationchange", applyScale, { passive: true });
      resizeBound = true;
    }

    return { viewportEl, scalerEl };
  }

  function applyScale() {
    if (!scalerEl) return;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const sx = vw / DESIGN_WIDTH;
    const sy = vh / DESIGN_HEIGHT;
    const scale = Math.min(sx, sy);
    scalerEl.style.transform = `scale(${scale})`;
  }

  /**
   * Reparent (or accept) the scene element inside the scaler wrapper and
   * apply scaling. Safe to call on every screen transition.
   */
  function mount(sceneEl) {
    const { scalerEl: sc } = ensureWrappers();
    // Remove anything previously in the scaler EXCEPT the new scene.
    Array.from(sc.children).forEach((child) => {
      if (child !== sceneEl) sc.removeChild(child);
    });
    if (sceneEl && sceneEl.parentNode !== sc) {
      sc.appendChild(sceneEl);
    }
    // Force the scene to fill the design footprint exactly.
    if (sceneEl) {
      sceneEl.style.position = "absolute";
      sceneEl.style.left = "0";
      sceneEl.style.top = "0";
      sceneEl.style.width = DESIGN_WIDTH + "px";
      sceneEl.style.height = DESIGN_HEIGHT + "px";
      sceneEl.style.margin = "0";
    }
    applyScale();
    return sc;
  }

  function getScaler() {
    ensureWrappers();
    return scalerEl;
  }

  /**
   * Reset / clear the scaler (used between screen transitions when a
   * screen calls `document.body.innerHTML = ""`).
   */
  function reset() {
    if (!document.body.contains(viewportEl)) {
      viewportEl = null;
      scalerEl = null;
    }
    ensureWrappers();
    // Empty the scaler so the next screen starts clean.
    while (scalerEl.firstChild) scalerEl.removeChild(scalerEl.firstChild);
  }

  window.FamiliarBotResponsive = {
    mount,
    reset,
    getScaler,
    DESIGN_WIDTH,
    DESIGN_HEIGHT
  };

  // Re-apply scale once DOM is ready (covers the loading screen which
  // appears before the first explicit mount() call).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureWrappers();
      applyScale();
    });
  } else {
    ensureWrappers();
    applyScale();
  }
})();
