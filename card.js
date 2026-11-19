// The full-time card: a 1080x1350 picture of a finished match, drawn on a canvas in the match's own colours.
// The score is the star. Behind it the whole crowd cheers (or sags), and when you won, fireworks show above it.
// Everything is seeded, so the same match always draws the same card; another seed gives another crowd.
import { makeStands, drawStands } from './stands.js';

export const cardWidth = 1080, cardHeight = 1350;

function randomFrom(seed) {
  let state = (Math.floor(seed) % 2147483646) + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

const font = (size, weight = 650) => `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;

// The two sides keep the colours of the rackets in the game: green for you, brown for the CPU.
const youColor = '#a9d678', cpuColor = '#cf936b', gold = '#e9c25a';

// One block of stands, scaled up so faces show, with everyone on it reacting: all cheering for a win, all sagging for a loss.
function crowdBlock(ctx, palette, seed, top, won) {
  const scale = 2.3, blockHeight = 178 * scale;
  const stands = makeStands(seed);
  for (const side of ['left', 'right']) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, cardWidth, blockHeight); ctx.clip();
    ctx.translate(cardWidth / 2 - 450 * scale, top);
    ctx.scale(scale, scale);
    ctx.beginPath(); ctx.rect(side === 'left' ? 0 : 450, 0, 450, 178); ctx.clip();
    // A side that "cheers" raises its arms and the other droops, so to droop everywhere each half asks for the other side.
    const cheerSide = won ? side : side === 'left' ? 'right' : 'left';
    drawStands(ctx, stands, { palette, now: 4000, cheer: { side: cheerSide, since: 0, finale: true },
      mood: { effect: undefined, effectAge: 0, wind: 0, standing: won ? 1 : 0, surprise: 0, clock: seed * 1000 } });
    ctx.restore();
  }
}

function firework(ctx, x, y, radius, color, random) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round';
  const spokes = 14, turn = random() * Math.PI;
  for (let k = 0; k < spokes; k++) {
    const angle = turn + k / spokes * Math.PI * 2;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * radius * 0.45, y + Math.sin(angle) * radius * 0.45);
    ctx.lineTo(x + Math.cos(angle) * radius * 0.85, y + Math.sin(angle) * radius * 0.85);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 7, 0, Math.PI * 2); ctx.fill();
  }
}

function confetti(ctx, palette, random, count, top, bottom) {
  const colors = [youColor, cpuColor, gold, palette.court, palette.line];
  for (let k = 0; k < count; k++) {
    ctx.save();
    ctx.translate(random() * cardWidth, top + random() * (bottom - top));
    ctx.rotate(random() * Math.PI);
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.fillRect(-9, -4, 18 + random() * 8, 8);
    ctx.restore();
  }
}

function drizzle(ctx, palette, random, top, bottom) {
  ctx.strokeStyle = palette.page + '88';
  ctx.lineWidth = 3;
  for (let k = 0; k < 120; k++) {
    const x = random() * cardWidth, y = top + random() * (bottom - top);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 36); ctx.stroke();
  }
}

function wrap(ctx, text, maxWidth) {
  const rows = [];
  let row = '';
  for (const word of text.split(' ')) {
    const next = row ? row + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && row) { rows.push(row); row = word; } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

// match: { won, mine, theirs, cpuLevel, stage, rally, effects: [['SHOCK', 3], ...], line, name, seed, palette }
export function drawCard(ctx, match) {
  const { palette, won, mine, theirs, cpuLevel, stage, rally, effects = [], line, name, seed = 1 } = match;
  // The card is shared by many players, so the player's own name stands where YOU would.
  const playerLabel = name || 'YOU';
  const random = randomFrom(seed);
  const W = cardWidth, H = cardHeight;
  ctx.fillStyle = palette.page;
  ctx.fillRect(0, 0, W, H);

  // The crowd: two blocks of stands one above the other, filling the top of the card.
  crowdBlock(ctx, palette, seed, 0, won);
  crowdBlock(ctx, palette, seed + 7, 178 * 2.3, won);
  if (won) {
    firework(ctx, 150, 300, 150, gold, random);
    firework(ctx, 930, 210, 120, youColor, random);
    firework(ctx, 820, 470, 110, cpuColor, random);
    firework(ctx, 250, 520, 90, palette.court, random);
    confetti(ctx, palette, random, 70, 0, 760);
  } else {
    drizzle(ctx, palette, random, 0, 800);
  }

  // The score panel: flat ink, sharp corners, nothing else competes with the numbers.
  const panelX = 56, panelY = 560, panelW = W - 112, panelH = 700;
  ctx.fillStyle = palette.ink;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  const pad = 56, inner = panelX + pad, innerRight = panelX + panelW - pad;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = won ? gold : palette.line;
  ctx.fillRect(inner, panelY + 52, 44, 8);
  ctx.fillStyle = palette.court; ctx.font = font(34); ctx.textAlign = 'left';
  ctx.fillText('FULL-TIME', inner + 62, panelY + 66);
  ctx.textAlign = 'right'; ctx.globalAlpha = 0.6;
  ctx.fillText('ODD BIRDLE', innerRight, panelY + 66);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center'; ctx.fillStyle = palette.court; ctx.font = font(330);
  ctx.fillText(`${mine}:${theirs}`, W / 2, panelY + 400);

  // Who is who, with the colours the rackets have in the game. A long name shrinks to fit its half.
  const youSize = (() => {
    let size = 40;
    ctx.font = font(size);
    while (size > 22 && ctx.measureText(playerLabel).width > 440) { size -= 2; ctx.font = font(size); }
    return size;
  })();
  ctx.textAlign = 'left';
  ctx.fillStyle = youColor; ctx.fillRect(inner, panelY + 440, 120, 10);
  ctx.fillStyle = palette.court; ctx.font = font(youSize); ctx.fillText(playerLabel, inner, panelY + 500);
  ctx.textAlign = 'right'; ctx.font = font(40);
  ctx.fillStyle = cpuColor; ctx.fillRect(innerRight - 120, panelY + 440, 120, 10);
  ctx.fillStyle = palette.court; ctx.fillText(`CPU LV.${cpuLevel}`, innerRight, panelY + 500);

  // Facts, then the line.
  const facts = [];
  if (stage) facts.push(`STAGE ${stage}`);
  if (rally) facts.push(`LONGEST RALLY ${rally}`);
  // However many kinds of effect fired, the card names only the busiest and counts the rest.
  const byCount = [...effects].sort((a, b) => b[1] - a[1]);
  if (byCount.length <= 2) for (const [effect, times] of byCount) facts.push(`${effect} ×${times}`);
  else facts.push(`${byCount.length} EFFECTS`, `MOST: ${byCount[0][0]} ×${byCount[0][1]}`);
  ctx.fillStyle = palette.court; ctx.globalAlpha = 0.65; ctx.font = font(27); ctx.textAlign = 'center';
  ctx.fillText(facts.join('  ·  '), W / 2, panelY + 568);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.court; ctx.font = font(50);
  const rows = wrap(ctx, line, panelW - 2 * pad);
  rows.forEach((row, index) => ctx.fillText(row, W / 2, panelY + 640 + index * 58));

}
