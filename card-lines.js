// One-line verdicts for the full-time card. Written by hand, picked by what happened in the match (no AI involved,
// so it works offline and the same match always gets the same kind of line). Lines are grouped by situation; the
// first group below that matches wins, and `seed` picks one line inside it.
const lines = {
  lostAndCarded: [
    'You lost, and you made a card?',
    'A bold choice to commemorate this.',
    'Framed. For the wrong reasons.',
    'Brave of you to share this.'
  ],
  shutout: [
    'The CPU was invited, not required.',
    'Spectators got a better view than the opponent.',
    'A clean sheet and a cleaner conscience.',
    'The other racket was a decoration.'
  ],
  dominant: [
    'Never in doubt. Except by the CPU.',
    'A comfortable evening for one side.',
    'The net barely got a say.'
  ],
  comeback: [
    'Down, then not down.',
    'Somebody forgot to tell you it was over.',
    'The comeback nobody ordered.'
  ],
  close: [
    'Decided by a point and a prayer.',
    'Nerves were consumed. Snacks too.',
    'Closer than the shuttle and the net.'
  ],
  effectsHurt: [
    'The wind won this one.',
    'Physics was not on your team.',
    'The shuttle had other plans.'
  ],
  lostNarrow: [
    'So close, and yet a point away.',
    'Lost the match, kept the dignity.'
  ],
  lost: [
    'The CPU sends its regards.',
    'Character building. Racket breaking.',
    'It happens to the best of us. Mostly the others.'
  ],
  won: [
    'Another one for the cabinet.',
    'A win is a win.',
    'The crowd approved.'
  ]
};

const pick = (group, seed) => group[Math.abs(Math.floor(seed)) % group.length];

// stats: { won, mine, theirs, comeback, effectsFaults, rally }
export function verdictFor(stats, seed = 0) {
  const { won, mine, theirs, comeback = false, effectsFaults = 0 } = stats;
  const gap = Math.abs(mine - theirs);
  if (!won) {
    if (effectsFaults >= 2) return pick(lines.effectsHurt, seed);
    return pick(gap <= 1 ? lines.lostNarrow : lines.lost, seed);
  }
  if (theirs === 0) return pick(lines.shutout, seed);
  if (comeback) return pick(lines.comeback, seed);
  if (gap <= 1) return pick(lines.close, seed);
  if (gap >= 4) return pick(lines.dominant, seed);
  return pick(lines.won, seed);
}

// Shown instead of the verdict when the player asks for a card after losing: the game's way of teasing.
export const lostCardLine = seed => pick(lines.lostAndCarded, seed);
