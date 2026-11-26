// What happened in one match, gathered frame by frame from the game's views, for the full-time card:
// the longest rally, how often each effect came up, and whether the winner had been behind by two or more.
const effectNames = {
  shock: 'SHOCK', wind: 'GUST', balloon: 'BALLOON', highNet: 'HIGH NET', lowNet: 'LOW NET',
  bumper: 'BUMPER', decoy: 'DECOY', trampoline: 'TRAMPOLINE', freeze: 'FREEZE', invisible: 'INVISIBLE'
};

export function createMatchStats() {
  let rally = 0, longest = 0, lastStrike, lastEffect, worstLead = 0, lastScore = '0:0';
  const effects = new Map();
  let started = false;

  return {
    // Call with every view of the match; `side` is the player's side ('left' for solo play).
    update(view, side = 'left') {
      if (!view) return;
      if (view.phase === 'starting' || (!started && view.phase === 'ready')) {
        if (view.score && view.score.left === 0 && view.score.right === 0 && started) this.reset();
      }
      if (view.phase !== 'live' && view.phase !== 'finished') return;
      started = true;
      const other = side === 'left' ? 'right' : 'left';
      if (view.score) {
        const key = view.score.left + ':' + view.score.right;
        if (key !== lastScore) { lastScore = key; rally = 0; lastStrike = undefined; }
        worstLead = Math.min(worstLead, view.score[side] - view.score[other]);
      }
      if (view.strike && view.strike.flight !== lastStrike) {
        lastStrike = view.strike.flight;
        rally++;
        longest = Math.max(longest, rally);
      }
      if (view.effect !== lastEffect) {
        lastEffect = view.effect;
        const name = effectNames[view.effect];
        if (name) effects.set(name, (effects.get(name) ?? 0) + 1);
      }
    },
    reset() {
      rally = 0; longest = 0; lastStrike = undefined; lastEffect = undefined; worstLead = 0; lastScore = '0:0';
      effects.clear(); started = false;
    },
    // The facts the card needs, once the match is over.
    summary(view, side = 'left') {
      const other = side === 'left' ? 'right' : 'left';
      const mine = view.score[side], theirs = view.score[other];
      const won = view.winner === side;
      return {
        won, mine, theirs, cpuLevel: view.cpuLevel, rally: longest,
        effects: [...effects.entries()].sort((a, b) => b[1] - a[1]),
        effectKinds: effects.size,
        comeback: won && worstLead <= -2
      };
    }
  };
}
