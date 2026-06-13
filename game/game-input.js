/**
 * FamiliarBot League — Multi-touch input patch (sibling of game-screen.js).
 *
 * Pokémon-Unite-style mobile controls:
 *
 *   • The whole stage accepts MULTI-TOUCH (no preventDefault until we
 *     actually claim a finger, so buttons keep firing their click handlers).
 *
 *   • LEFT half of the stage = MOVEMENT.
 *       The first finger that lands on the left half (and not on a
 *       button) spawns the joystick visually at the touch point — like
 *       Pokémon Unite. The original `.moba-stick` element is re-used as
 *       the visual; it stays hidden until a left-half touch arrives.
 *
 *   • RIGHT half of the stage = CAMERA DRAG.
 *       Any finger that lands on the right half (and not on a button)
 *       drags the camera. Releasing the finger lerps the camera back
 *       to the player so it always re-centers — never lose the bot.
 *
 *   • Buttons (.ab / .moba-sig / .moba-recall / .moba-icon / .moba-minimap
 *     / .moba-portrait) are detected via elementFromPoint and let to
 *     bubble naturally; their touches never spawn a joystick / camera
 *     drag.
 *
 *   • Multi-touch: every finger has its own `identifier` so the user can
 *     move + drag the camera + tap an ability simultaneously.
 *
 *   • Mouse fallback (desktop): left-half mouse-drag = joystick, right-
 *     half mouse-drag = camera pan. Keyboard WASD/arrows still work
 *     because the hud's keyboard listener stays untouched.
 *
 * Exposes (window):
 *   FamiliarBotInput.attach(hud, stage)
 *   FamiliarBotInput.getMoveVector()       -> { x, y }
 *   FamiliarBotInput.getCameraOffset()     -> { x, z }
 *   FamiliarBotInput.update(dt)            -> called every frame by
 *                                              game-scene to lerp the
 *                                              camera offset back to 0.
 */
(function (global) {
  const NS = {};

  // ----- tunables ------------------------------------------------------
  const JOY_RADIUS_PX     = 60;     // joystick max knob distance
  const JOY_SIZE_PX       = 120;    // visual size of the spawned ring
  const CAM_DRAG_SCALE    = 0.18;   // world units of pan per CSS pixel
  const CAM_MAX_OFFSET    = 36;     // clamp pan range (world units)
  const CAM_RECENTER_RATE = 6;      // higher = snaps back faster

  // Buttons / hud zones that should NEVER be treated as joystick/cam-drag.
  const BUTTON_SELECTOR =
    '.moba-abilities, .moba-abilities *, .ab, .ab *,' +
    '.moba-rail, .moba-rail *, .moba-sig,' +
    '.moba-recall, .moba-recall *,' +
    '.moba-right-hud, .moba-right-hud *, .moba-icon,' +
    '.moba-minimap, .moba-minimap *,' +
    '.moba-team-icons, .moba-team-icons *, .moba-portrait, .moba-portrait *,' +
    '.moba-picker, .moba-picker *,' +
    '.moba-victory, .moba-victory *';

  // ----- runtime state -------------------------------------------------
  let _hud      = null;
  let _stage    = null;
  let _stickEl  = null;
  let _knobEl   = null;

  // joystick state — owns one finger at a time
  const joy = {
    fingerId: null,
    cx: 0, cy: 0,           // joystick origin in client coords
    dx: 0, dy: 0            // normalised -1..1
  };

  // camera-drag state — also owns one finger
  const cam = {
    fingerId: null,
    startX: 0, startY: 0,
    offX: 0, offZ: 0        // world-space offset, lerps toward 0 on release
  };

  function elementUnder(x, y) {
    try { return document.elementFromPoint(x, y); }
    catch (_e) { return null; }
  }
  function isOverButton(x, y) {
    const el = elementUnder(x, y);
    if (!el) return false;
    return !!el.closest(BUTTON_SELECTOR);
  }
  function isLeftHalf(clientX) {
    if (!_stage) return clientX < (global.innerWidth || 1) / 2;
    const r = _stage.getBoundingClientRect();
    return clientX < r.left + r.width / 2;
  }

  function showJoystickAt(clientX, clientY) {
    if (!_stickEl) return;
    const r = _stage.getBoundingClientRect();
    // Position via left/top relative to the stage (so it scales with the
    // fb-scaler transform on its parent). The stage already has
    // position:relative; sticking width/height in px is fine — the scaler
    // applies the same transform to every child.
    const size = JOY_SIZE_PX;
    _stickEl.style.display    = 'flex';
    _stickEl.style.position   = 'absolute';
    _stickEl.style.left       = (clientX - r.left - size / 2) + 'px';
    _stickEl.style.top        = (clientY - r.top  - size / 2) + 'px';
    _stickEl.style.right      = 'auto';
    _stickEl.style.bottom     = 'auto';
    _stickEl.style.width      = size + 'px';
    _stickEl.style.height     = size + 'px';
    _stickEl.style.pointerEvents = 'none'; // we handle every touch ourselves
    if (_knobEl) _knobEl.style.transform = '';
    joy.cx = clientX;
    joy.cy = clientY;
    joy.dx = 0;
    joy.dy = 0;
  }
  function moveJoystickKnob(clientX, clientY) {
    if (!_knobEl) return;
    const dx = clientX - joy.cx;
    const dy = clientY - joy.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const r = JOY_RADIUS_PX;
    const cx = len > r ? dx / len * r : dx;
    const cy = len > r ? dy / len * r : dy;
    _knobEl.style.transform = `translate(${cx}px, ${cy}px)`;
    joy.dx = cx / r;
    joy.dy = cy / r;
  }
  function hideJoystick() {
    if (_stickEl) _stickEl.style.display = 'none';
    if (_knobEl)  _knobEl.style.transform = '';
    joy.fingerId = null;
    joy.dx = 0;
    joy.dy = 0;
  }

  // ----- touch handlers ------------------------------------------------
  function onTouchStart(ev) {
    if (!ev.changedTouches) return;
    let claimed = false;
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i];
      if (isOverButton(t.clientX, t.clientY)) continue;

      if (isLeftHalf(t.clientX)) {
        // LEFT — spawn joystick if none is active
        if (joy.fingerId === null) {
          joy.fingerId = t.identifier;
          showJoystickAt(t.clientX, t.clientY);
          claimed = true;
        }
      } else {
        // RIGHT — claim a camera-drag finger if none is active
        if (cam.fingerId === null) {
          cam.fingerId = t.identifier;
          cam.startX = t.clientX;
          cam.startY = t.clientY;
          claimed = true;
        }
      }
    }
    if (claimed) ev.preventDefault();
  }
  function onTouchMove(ev) {
    if (!ev.changedTouches) return;
    let claimed = false;
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i];
      if (t.identifier === joy.fingerId) {
        moveJoystickKnob(t.clientX, t.clientY);
        claimed = true;
      } else if (t.identifier === cam.fingerId) {
        const px = (t.clientX - cam.startX);
        const py = (t.clientY - cam.startY);
        cam.offX = Math.max(-CAM_MAX_OFFSET, Math.min(CAM_MAX_OFFSET, -px * CAM_DRAG_SCALE));
        cam.offZ = Math.max(-CAM_MAX_OFFSET, Math.min(CAM_MAX_OFFSET, -py * CAM_DRAG_SCALE));
        claimed = true;
      }
    }
    if (claimed) ev.preventDefault();
  }
  function onTouchEnd(ev) {
    if (!ev.changedTouches) return;
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i];
      if (t.identifier === joy.fingerId) hideJoystick();
      else if (t.identifier === cam.fingerId) {
        cam.fingerId = null;
        // offset is left non-zero; the per-frame update() lerps it back.
      }
    }
  }

  // ----- mouse fallback (desktop) --------------------------------------
  let mouseMode = null;       // 'joy' | 'cam' | null
  let mouseStart = { x: 0, y: 0 };
  function onMouseDown(ev) {
    if (ev.button !== 0) return;
    if (isOverButton(ev.clientX, ev.clientY)) return;
    if (isLeftHalf(ev.clientX)) {
      mouseMode = 'joy';
      joy.fingerId = 'mouse';
      showJoystickAt(ev.clientX, ev.clientY);
    } else {
      mouseMode = 'cam';
      cam.fingerId = 'mouse';
      cam.startX = ev.clientX;
      cam.startY = ev.clientY;
    }
    ev.preventDefault();
  }
  function onMouseMove(ev) {
    if (mouseMode === 'joy') {
      moveJoystickKnob(ev.clientX, ev.clientY);
    } else if (mouseMode === 'cam') {
      const px = (ev.clientX - cam.startX);
      const py = (ev.clientY - cam.startY);
      cam.offX = Math.max(-CAM_MAX_OFFSET, Math.min(CAM_MAX_OFFSET, -px * CAM_DRAG_SCALE));
      cam.offZ = Math.max(-CAM_MAX_OFFSET, Math.min(CAM_MAX_OFFSET, -py * CAM_DRAG_SCALE));
    }
  }
  function onMouseUp() {
    if (mouseMode === 'joy') hideJoystick();
    if (mouseMode === 'cam') cam.fingerId = null;
    mouseMode = null;
  }

  // ----- public API ----------------------------------------------------
  function attach(hud, stage) {
    _hud = hud;
    _stage = stage;
    if (!stage || !hud) return;

    _stickEl = stage.querySelector('.moba-stick');
    _knobEl  = _stickEl ? _stickEl.querySelector('.knob') : null;

    if (_stickEl) {
      // Hide the legacy fixed-position joystick — it now spawns on touch.
      _stickEl.style.display = 'none';
    }

    // Override the hud's getMoveVector so the world reads OUR joystick.
    // Keyboard (WASD/arrows) is still handled by the hud's own getMoveVector
    // — we fall through to it when no touch/mouse joystick is active.
    const origGetMv = hud.getMoveVector.bind(hud);
    hud.getMoveVector = function () {
      if (joy.fingerId !== null) {
        return { x: joy.dx, y: joy.dy };
      }
      return origGetMv();
    };

    // Make sure the browser never hijacks touches for scroll / pinch zoom.
    stage.style.touchAction = 'none';
    stage.style.webkitUserSelect = 'none';
    stage.style.userSelect = 'none';

    // Listeners on the stage itself — buttons inside still get their own
    // click events because we only preventDefault when we CLAIM a touch.
    stage.addEventListener('touchstart',  onTouchStart, { passive: false });
    stage.addEventListener('touchmove',   onTouchMove,  { passive: false });
    stage.addEventListener('touchend',    onTouchEnd,   { passive: false });
    stage.addEventListener('touchcancel', onTouchEnd,   { passive: false });

    stage.addEventListener('mousedown',   onMouseDown);
    global.addEventListener('mousemove',  onMouseMove);
    global.addEventListener('mouseup',    onMouseUp);

    // Stop the global mousemove listener that hud.js installs from
    // jittering the legacy joystick — its knob is now hidden anyway,
    // but kill the side effect by clearing transform on hide.
    if (_knobEl) _knobEl.style.transform = '';

    console.log('[Input] FamiliarBot multi-touch input ready');
  }

  function getMoveVector() {
    return { x: joy.dx, y: joy.dy };
  }
  function getCameraOffset() {
    return { x: cam.offX, z: cam.offZ };
  }
  function update(dt) {
    // Lerp the camera offset back to (0,0) when no finger is dragging.
    if (cam.fingerId === null) {
      const k = Math.min(1, CAM_RECENTER_RATE * (dt || 0.016));
      cam.offX += (0 - cam.offX) * k;
      cam.offZ += (0 - cam.offZ) * k;
      if (Math.abs(cam.offX) < 0.02) cam.offX = 0;
      if (Math.abs(cam.offZ) < 0.02) cam.offZ = 0;
    }
  }

  NS.attach          = attach;
  NS.getMoveVector   = getMoveVector;
  NS.getCameraOffset = getCameraOffset;
  NS.update          = update;
  global.FamiliarBotInput = NS;
})(typeof window !== 'undefined' ? window : globalThis);
