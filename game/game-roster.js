/**
 * FamiliarBot League — roster helpers.
 *
 * Tiny utility module: a hand-picked list of "fallback" names and a helper
 * for choosing 4 bot ids per team without re-using the player's chosen bot.
 *
 * Globals exposed:
 *   window.MOBA_FALLBACK_NAMES — array of short call-signs
 *   window.pickMobaRosterFor(team, excludeBotId, count) -> string[]
 */
(function (global) {
  const FALLBACK_NAMES = [
    "Nova", "Echo", "Onyx", "Ace", "Spark", "Pixel", "Rune", "Bolt", "Halo", "Vortex"
  ];

  function pickRosterFor(team, excludeBotId, count) {
    const ids = (global.MOBA_ROSTER ||
      ['atlas', 'blaze', 'volt', 'sage', 'bastion', 'vex', 'bruno']).slice();
    const arr = [];
    for (let i = 0; i < count; i++) {
      let id;
      do { id = ids[Math.floor(Math.random() * ids.length)]; }
      while (team === 'player' && id === excludeBotId && ids.length > 1);
      arr.push(id);
    }
    return arr;
  }

  global.MOBA_FALLBACK_NAMES = FALLBACK_NAMES;
  global.pickMobaRosterFor   = pickRosterFor;
})(typeof window !== 'undefined' ? window : globalThis);
