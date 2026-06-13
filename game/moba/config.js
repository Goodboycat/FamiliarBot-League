/**
 * FamiliarBot League — MOBA Config (Pokémon-Unite-style)
 * ------------------------------------------------------
 * All gameplay constants live here so they can be tuned without touching
 * the runtime code. Pure data + a couple of helper lookups.
 *
 * Exposes (window):
 *   MOBA_CONFIG, MOBA_POWERS, MOBA_BOTS, MOBA_BUFFS
 */
(function (global) {
  // -------------------------------------------------------------------------
  // CORE MATCH RULES
  // -------------------------------------------------------------------------
  const MOBA_CONFIG = {
    matchDurationSec: 10 * 60,          // 10 minutes
    finalRushSec:     2 * 60,           // last 2 min: central mega-boss
    teamSize:         5,                // 5v5 (1 player + 4 AI vs 5 AI)
    maxLevel:         15,
    xpPerLevel: (lvl) => 50 + lvl * 35, // increases with level
    scorePerOrb:      1,
    capturePointHp:   100,              // "scoring" fills this -> circle destroyed
    captureRange:     10,
    leashRange:       12,
    abilityRespawnSec: 6,
    baseRespawnSec:    7,
    pickPowerAtLevels: [3, 5, 7, 9, 11], // levels where the player picks new powers
    powerSlotCount:    2,                // can hold only 2 active powers
    uniteUnlockLevel:  6,
    eliminationXp:    40,
    bossXp:          120,
    wildRobotXp:      18,

    // spawn timings (sec from match start)
    wildRobotInitial:   8,
    wildRobotRespawn:  35,
    sideBossInitial:   90,                // first side bosses at 1:30 in
    sideBossRespawn:  120,
    centerBossAt:     8 * 60,             // central mega-boss spawns 2:00 remaining
    centerBossScore:  60,                 // instant team score on kill
  };

  // -------------------------------------------------------------------------
  // POWER POOL — every power has an emoji-icon, color, cooldown, VFX preset.
  // The player can hold POWER_SLOT_COUNT of these at once.
  // The "ultimate" (UNITE MOVE) is granted at level 6 regardless of picks.
  // -------------------------------------------------------------------------
  const MOBA_POWERS = [
    {
      id: 'plasma_bolt', name: 'Plasma Bolt', icon: '⚡',
      color: 0x39f5ff, cooldown: 4, range: 30,
      vfx: 'beam', dmg: 28, desc: 'Long-range plasma beam.'
    },
    {
      id: 'shock_pulse', name: 'Shock Pulse', icon: '✦',
      color: 0xc685ff, cooldown: 6, range: 14,
      vfx: 'ring', dmg: 36, desc: 'AoE pulse around caster.'
    },
    {
      id: 'flame_burst', name: 'Flame Burst', icon: '🔥',
      color: 0xff7a2a, cooldown: 7, range: 18,
      vfx: 'cone', dmg: 42, desc: 'Forward cone of fire.'
    },
    {
      id: 'frost_nova', name: 'Frost Nova', icon: '❄',
      color: 0x88ccff, cooldown: 8, range: 12,
      vfx: 'nova', dmg: 22, slow: 0.5, slowDur: 2.5,
      desc: 'Slow & damage in a ring.'
    },
    {
      id: 'repair_field', name: 'Repair Field', icon: '✚',
      color: 0x66ffb2, cooldown: 9, range: 10,
      vfx: 'heal', heal: 60,
      desc: 'Heal self + nearby allies.'
    },
    {
      id: 'dash_strike', name: 'Dash Strike', icon: '➤',
      color: 0xffd479, cooldown: 5, range: 18,
      vfx: 'dash', dmg: 24,
      desc: 'Lunge forward, damaging the first hit.'
    },
    {
      id: 'shield_wall', name: 'Shield Wall', icon: '🛡',
      color: 0xb8c8ff, cooldown: 12, range: 0,
      vfx: 'shield', shield: 80, dur: 4,
      desc: 'Absorb damage for 4 seconds.'
    },
    {
      id: 'gravity_slam', name: 'Gravity Slam', icon: '💥',
      color: 0xff5577, cooldown: 10, range: 14,
      vfx: 'slam', dmg: 50,
      desc: 'Heavy AoE slam.'
    }
  ];
  const MOBA_POWERS_BY_ID = Object.fromEntries(MOBA_POWERS.map(p => [p.id, p]));

  // Unite (ultimate) — same for every bot in the prototype.
  const UNITE_MOVE = {
    id: 'unite_nova', name: 'Unite Nova', icon: '✸',
    color: 0xfff066, cooldown: 90, range: 22,
    vfx: 'unite', dmg: 90,
    desc: 'Massive radiant burst.'
  };

  // -------------------------------------------------------------------------
  // BOTS — colored capsule placeholders (per user's "no GLB" requirement).
  // -------------------------------------------------------------------------
  const MOBA_BOTS = {
    atlas:   { body: 0x4a87b8, head: 0x5fa8d8, glow: 0x39f5ff, role: 'All-Rounder' },
    blaze:   { body: 0xc24a2a, head: 0xff8855, glow: 0xff5522, role: 'Fighter'     },
    bastion: { body: 0x4a5a72, head: 0x7d8aa0, glow: 0xb8c8ff, role: 'Tank'        },
    volt:    { body: 0xb89a3a, head: 0xf2d24a, glow: 0xfff066, role: 'Speedster'   },
    vex:     { body: 0x6a3aa8, head: 0xa258ff, glow: 0xc685ff, role: 'Trickster'   },
    sage:    { body: 0x3a8a6a, head: 0x55c089, glow: 0x66ffb2, role: 'Supporter'   },
    bruno:   { body: 0x8a5a2a, head: 0xb88044, glow: 0xff9c4a, role: 'Bruiser'     }
  };
  const BOT_ROSTER = Object.keys(MOBA_BOTS);

  // -------------------------------------------------------------------------
  // BUFFS granted by killing a wild boss.
  // -------------------------------------------------------------------------
  const MOBA_BUFFS = {
    atk:   { id: 'atk',   name: 'ATK +30%',   color: 0xff7a2a, mult: { dmg: 1.30 },     dur: 60 },
    spd:   { id: 'spd',   name: 'Speed +25%', color: 0xfff066, mult: { speed: 1.25 },   dur: 60 },
    regen: { id: 'regen', name: 'Regen',      color: 0x66ffb2, regenHpPerSec: 6,        dur: 60 },
    shield:{ id: 'shield',name: 'Bulwark',    color: 0xb8c8ff, mult: { dmgTaken: 0.7 }, dur: 60 }
  };

  global.MOBA_CONFIG = MOBA_CONFIG;
  global.MOBA_POWERS = MOBA_POWERS;
  global.MOBA_POWERS_BY_ID = MOBA_POWERS_BY_ID;
  global.MOBA_UNITE = UNITE_MOVE;
  global.MOBA_BOTS = MOBA_BOTS;
  global.MOBA_ROSTER = BOT_ROSTER;
  global.MOBA_BUFFS = MOBA_BUFFS;
})(typeof window !== 'undefined' ? window : globalThis);
