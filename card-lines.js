// One-line verdicts for the full-time card. Written by hand and picked by what happened in the match (no AI: it works
// offline, costs nothing and a match of the same kind always gets the same kind of line). The first situation that
// fits decides the group, and `seed` picks a line inside it. After a loss the teasing lines are mixed into the pool.
export const lines = {
  // Wins
  shutoutWin: [
    'The other racket was a decoration.',
    'The CPU was invited, not required.',
    'Spectators got a better view than the opponent.',
    'A clean sheet and a cleaner conscience.',
    'The CPU has asked to see the replay.',
    'Zero. The CPU brought zero.',
    'They came, they watched, they left.'
  ],
  dominantWin: [
    'Never in doubt. Except by the CPU.',
    'A comfortable evening for one side.',
    'The net barely got a say.',
    'This was less a match, more a tour.',
    'The CPU is checking its settings.',
    'You made it look rehearsed.',
    'Efficient. Slightly rude.'
  ],
  comebackWin: [
    'Down, then not down.',
    'Somebody forgot to tell you it was over.',
    'The comeback nobody ordered.',
    'Written off, then written up.',
    'You were losing. Past tense.',
    'The crowd had left. The crowd came back.'
  ],
  closeWin: [
    'Decided by a point and a prayer.',
    'Nerves were consumed. Snacks too.',
    'A win so narrow it needs a seatbelt.',
    'One point. Barely enough to brag about, so brag.',
    'Everyone is still breathing, mostly.',
    'The scoreboard had to double-check.',
    'Won on a technicality: scoring more.'
  ],
  longRallyWin: [
    'Somewhere a shuttle is still in the air.',
    'That rally had its own weather.',
    'Your wrist filed a complaint.',
    'The longest rally. The shortest patience.',
    'Endurance, not talent. Take it.'
  ],
  chaosWin: [
    'Won through the chaos, somehow.',
    'The effects tried everything. So did you.',
    'Half the rules fell over and you stayed standing.',
    'Physics was a suggestion and you took it.',
    'Survived the strangest match of the day.'
  ],
  win: [
    'Another one for the cabinet.',
    'A win is a win.',
    'The crowd approved.',
    'Solid. Respectable. Acceptable.',
    'The CPU will remember this. Probably.',
    'Good game. You, specifically.',
    'Nothing to see here, just a win.'
  ],
  // Losses
  shutoutLoss: [
    'You are a decoration!',
    'You attended the match. That counts.',
    'The shuttle barely noticed you.',
    'Participation, in its purest form.',
    'Your racket was there in spirit.',
    'Nil. The crowd felt that.',
    'A bold strategy: not scoring.',
    'The net got more touches than you.'
  ],
  chaosLoss: [
    'The wind won this one.',
    'Physics was not on your team.',
    'The shuttle had other plans.',
    'It was the effects. It is always the effects.',
    'The rules changed mid-rally. You noticed.',
    'Blame the shuttle. It is odd enough.',
    'Not your fault. Mostly not your fault.'
  ],
  bigLoss: [
    'The CPU sends its regards.',
    'That one will sting until Thursday.',
    'Calm, composed, and completely outplayed.',
    'The crowd looked away.',
    'A learning experience, in bulk.',
    'It was educational. For the CPU.',
    'There is no shame. There is a score, though.'
  ],
  narrowLoss: [
    'So close, and yet a point away.',
    'Lost the match, kept the dignity.',
    'One point. One. Single. Point.',
    'The rematch is practically free.',
    'Almost heroic. Almost.',
    'You lost by a shuttle’s width.',
    'The crowd was rooting for you. Quietly.'
  ],
  loss: [
    'Character building. Racket breaking.',
    'It happens to the best of us. Mostly the others.',
    'The CPU had a good day.',
    'You will get it next time. Probably.',
    'Better luck with the next shuttle.',
    'A small defeat, nicely framed.',
    'Today the shuttle chose violence.'
  ],
  // Teasing lines for a loss that somebody still made a card of.
  lostAndCarded: [
    'You lost, and you made a card?',
    'A bold choice to commemorate this.',
    'Framed. For the wrong reasons.',
    'Brave of you to share this.',
    'Posting a loss: the real victory.',
    'The card knows. Everybody knows.',
    'Sharing the pain, how generous.',
    'Proof that you were there.'
  ]
};

const pick = (group, seed) => group[Math.abs(Math.floor(seed)) % group.length];

// stats: { won, mine, theirs, comeback, effectsFaults, effectKinds, rally }
export function verdictFor(stats, seed = 0) {
  const { won, mine, theirs, comeback = false, effectsFaults = 0, effectKinds = 0, rally = 0 } = stats;
  const gap = Math.abs(mine - theirs);
  if (won) {
    if (theirs === 0) return pick(lines.shutoutWin, seed);
    if (comeback) return pick(lines.comebackWin, seed);
    if (gap <= 1) return pick(lines.closeWin, seed);
    if (effectKinds >= 6) return pick(lines.chaosWin, seed);
    if (rally >= 20) return pick(lines.longRallyWin, seed);
    if (gap >= 4) return pick(lines.dominantWin, seed);
    return pick(lines.win, seed);
  }
  let group;
  if (mine === 0) group = lines.shutoutLoss;
  else if (effectsFaults >= 2 || effectKinds >= 6) group = lines.chaosLoss;
  else if (gap >= 4) group = lines.bigLoss;
  else if (gap <= 1) group = lines.narrowLoss;
  else group = lines.loss;
  // A card only exists because the player asked for one, so the teasing lines are always in the pool after a loss.
  return pick([...group, ...lines.lostAndCarded], seed);
}
