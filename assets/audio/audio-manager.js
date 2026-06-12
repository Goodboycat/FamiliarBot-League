/**
 * FamiliarBot League — Audio Manager.
 *
 * Plays a single background-music track per screen (loading / menu / garage /
 * game / arena). Crossfades between tracks so transitions feel smooth, and
 * remembers per-track volume so we can duck music during sound effects later
 * without losing the global preference.
 *
 * Tracks:
 *   loading → assets/music/Loading_background_music.mp3
 *   menu    → assets/music/Menu_background_music.mp3
 *   garage  → assets/music/Garage_background_music.mp3
 *   game    → assets/music/Arena_background_music.mp3  (alias: "arena")
 *
 * Usage:
 *   FamiliarBotAudio.play("menu");          // crossfade to the menu track
 *   FamiliarBotAudio.stop();                // fade everything out
 *   FamiliarBotAudio.setVolume(0.5);        // 0..1
 *   FamiliarBotAudio.mute(true);
 *
 * Browsers block autoplay until the user has interacted with the page. We
 * register the first pointerdown/keydown as a one-shot unlock; until then,
 * play() calls are queued and will start as soon as the user interacts.
 */
(function () {
  // Resolve track URLs relative to THIS script regardless of where the page
  // calling play() lives (loading screen, menu, garage, etc.).
  const scriptEl = document.currentScript ||
    Array.from(document.scripts).find((s) => /audio-manager\.js/.test(s.src));
  const baseHref = scriptEl ? new URL(scriptEl.src, window.location.href) : window.location.href;
  const resolve = (path) => new URL(path, baseHref).href;

  const TRACKS = {
    loading: resolve("../music/Loading_background_music.mp3"),
    menu:    resolve("../music/Menu_background_music.mp3"),
    garage:  resolve("../music/Garage_background_music.mp3"),
    arena:   resolve("../music/Arena_background_music.mp3"),
    game:    resolve("../music/Arena_background_music.mp3")
  };

  const FADE_MS = 800;
  let masterVolume = 0.55;
  let muted = false;
  let currentTrack = null;          // key, e.g. "menu"
  let currentAudio = null;          // active <audio>
  let pendingTrack = null;          // queued track waiting for user gesture
  let unlocked = false;

  function fade(audio, from, to, ms) {
    if (!audio) return Promise.resolve();
    return new Promise((done) => {
      const start = performance.now();
      audio.volume = from;
      function step(now) {
        const t = Math.min(1, (now - start) / ms);
        audio.volume = from + (to - from) * t;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          done();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function effectiveVolume() {
    return muted ? 0 : masterVolume;
  }

  async function startTrack(key) {
    const url = TRACKS[key];
    if (!url) {
      console.warn(`[Audio] unknown track: ${key}`);
      return;
    }

    const next = new Audio(url);
    next.loop = true;
    next.preload = "auto";
    next.volume = 0;
    next.crossOrigin = "anonymous";
    next.dataset.trackKey = key;

    // Try to start. If the browser still refuses (no interaction yet),
    // remember the request so we can resume on the first user gesture.
    try {
      await next.play();
    } catch (err) {
      pendingTrack = key;
      console.info("[Audio] autoplay blocked, will resume on user gesture:", err.message);
      return;
    }

    const previous = currentAudio;
    currentAudio = next;
    currentTrack = key;

    // Crossfade
    const target = effectiveVolume();
    if (previous) {
      await Promise.all([
        fade(previous, previous.volume, 0, FADE_MS).then(() => {
          previous.pause();
        }),
        fade(next, 0, target, FADE_MS)
      ]);
    } else {
      await fade(next, 0, target, FADE_MS);
    }
  }

  function play(key) {
    if (!unlocked) {
      pendingTrack = key;
      // Still call startTrack so muted browsers at least attempt; many will
      // succeed silently if the page has any previous user gesture.
    }
    if (key === currentTrack && currentAudio && !currentAudio.paused) {
      return Promise.resolve();
    }
    return startTrack(key);
  }

  function stop() {
    pendingTrack = null;
    if (!currentAudio) return Promise.resolve();
    const a = currentAudio;
    currentAudio = null;
    currentTrack = null;
    return fade(a, a.volume, 0, FADE_MS).then(() => a.pause());
  }

  function setVolume(v) {
    masterVolume = Math.max(0, Math.min(1, Number(v) || 0));
    if (currentAudio) currentAudio.volume = effectiveVolume();
  }

  function mute(flag) {
    muted = !!flag;
    if (currentAudio) currentAudio.volume = effectiveVolume();
  }

  function toggleMute() {
    mute(!muted);
    return muted;
  }

  function unlock() {
    unlocked = true;
    if (pendingTrack) {
      const key = pendingTrack;
      pendingTrack = null;
      startTrack(key);
    }
  }

  // First user gesture unlocks audio on every modern browser.
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  });

  window.FamiliarBotAudio = {
    play,
    stop,
    setVolume,
    mute,
    toggleMute,
    get currentTrack() { return currentTrack; },
    get isMuted() { return muted; },
    get volume() { return masterVolume; },
    TRACKS
  };
})();
