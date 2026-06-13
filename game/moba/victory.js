/**
 * FamiliarBot League — match-end / victory screen.
 *
 * Shows VICTORY or DEFEAT, plus the per-player scoreboard with:
 *   points scored, kills, deaths, assists, dmg dealt, dmg taken, recovery.
 *
 *   showVictoryScreen(stage, {
 *     win: true,
 *     player: { name, role, stats },
 *     allies: [{ name, stats }],
 *     enemies: [{ name, stats }],
 *     scores: { player: 80, enemy: 64 },
 *     onContinue() {}
 *   })
 */
(function (global) {
  const STATS = ['scored','kills','deaths','assists','dmg','dmgTaken','heal'];
  const LABELS = {
    scored:   'Pts',
    kills:    'K',
    deaths:   'D',
    assists:  'A',
    dmg:      'DMG',
    dmgTaken: 'TAKEN',
    heal:     'REC'
  };

  function row(p, isHero) {
    const s = p.stats || {};
    const tds = STATS.map(k => `<td>${(s[k]|0)}</td>`).join('');
    return `<tr class="${isHero ? 'hero' : ''}">
      <td class="name">${p.name}<small>${p.role || ''}</small></td>
      ${tds}
    </tr>`;
  }

  function showVictoryScreen(stage, opts) {
    opts = opts || {};
    const win = !!opts.win;
    const overlay = document.createElement('div');
    overlay.className = 'moba-victory ' + (win ? 'win' : 'lose');

    const headerLabel = opts.draw ? 'STALEMATE' : (win ? 'VICTORY' : 'DEFEAT');

    overlay.innerHTML = `
      <div class="vic-wrap">
        <div class="vic-title">${headerLabel}</div>
        <div class="vic-sub">${opts.draw ? 'No team destroyed the others\' core.' : (win ? 'Your team destroyed the enemy core.' : 'Your core was destroyed.')}</div>
        <div class="vic-scores">
          <span class="b">${opts.scores ? opts.scores.player : 0}</span>
          <span class="vs">VS</span>
          <span class="r">${opts.scores ? opts.scores.enemy : 0}</span>
        </div>
        <div class="vic-table-wrap">
          <table class="vic-table">
            <thead><tr>
              <th>Player</th>
              ${STATS.map(k => `<th>${LABELS[k]}</th>`).join('')}
            </tr></thead>
            <tbody class="ally"></tbody>
            <tbody class="div"><tr><td colspan="${STATS.length+1}">ENEMY TEAM</td></tr></tbody>
            <tbody class="enemy"></tbody>
          </table>
        </div>
        <button class="vic-go">CONTINUE</button>
      </div>`;
    stage.appendChild(overlay);

    const allyBody  = overlay.querySelector('tbody.ally');
    const enemyBody = overlay.querySelector('tbody.enemy');
    const hero      = opts.player;
    if (hero) allyBody.insertAdjacentHTML('beforeend', row(hero, true));
    (opts.allies || []).forEach(a => allyBody.insertAdjacentHTML('beforeend', row(a, false)));
    (opts.enemies || []).forEach(e => enemyBody.insertAdjacentHTML('beforeend', row(e, false)));

    overlay.querySelector('.vic-go').addEventListener('click', () => {
      overlay.remove();
      if (typeof opts.onContinue === 'function') opts.onContinue();
    });

    return { destroy() { overlay.remove(); } };
  }

  global.showVictoryScreen = showVictoryScreen;
})(typeof window !== 'undefined' ? window : globalThis);
