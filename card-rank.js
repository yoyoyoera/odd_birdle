// Emphasis for the top three of the day on the daily card: a frame in gold, silver or bronze round the score panel and a
// big rank tab ("#1") standing on the panel's top edge. rank is 1, 2 or 3; panel = { x, y, w, h } is the score panel;
// the card is 1080x1350.
const accents = { 1: '#e9c25a', 2: '#c9d1d6', 3: '#cd8b5a' };
const font = (size, weight = 650) => `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;

export const rankAccent = rank => accents[rank];

export function drawRankFlourish(ctx, { rank, palette, panel, daily }) {
  const accent = accents[rank];
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(panel.x - 5, panel.y - 5, panel.w + 10, panel.h + 10);
  // The tab: flat, in the rank's colour, sitting on the panel's top edge at the right.
  const width = 400, height = 190;
  const x = panel.x + panel.w - width - 36, y = panel.y - height + 5;
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = palette.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(30);
  ctx.fillText('RANK', x + 30, y + 62);
  if (daily?.players) { ctx.globalAlpha = 0.75; ctx.fillText(`OF ${daily.players}`, x + 30, y + 150); ctx.globalAlpha = 1; }
  ctx.textAlign = 'right';
  ctx.font = font(190);
  ctx.fillText(`#${rank}`, x + width - 26, y + 158);
  ctx.restore();
}
