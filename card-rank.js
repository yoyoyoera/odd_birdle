// Emphasis for the top three of the day on the daily card: a frame in gold, silver or bronze round the score panel and a
// big rank tab ("#1") standing on the panel's top edge. rank is 1, 2 or 3; panel = { x, y, w, h } is the score panel;
// the card is 1080x1350.
const accents = { 1: '#e9c25a', 2: '#c9d1d6', 3: '#cd8b5a' };
const font = (size, weight = 650) => `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;

export const rankAccent = rank => accents[rank];

export function drawRankFlourish(ctx, { rank, palette, panel, daily }) {
  const accent = accents[rank];
  const border = 10;
  // The frame and the tab are one shape: the tab rises out of the frame's top-right corner, flush with its right edge.
  const outerLeft = panel.x - border, outerTop = panel.y - border, outerRight = panel.x + panel.w + border;
  const tabWidth = 372, tabHeight = 176;
  const tabLeft = outerRight - tabWidth, tabTop = outerTop - tabHeight;
  ctx.save();
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.lineWidth = border;
  ctx.strokeRect(panel.x - border / 2, panel.y - border / 2, panel.w + border, panel.h + border);
  ctx.fillRect(tabLeft, tabTop, tabWidth, tabHeight + border);
  // Text: RANK and OF n stacked on the left, lined up with the top and the baseline of the big numeral.
  ctx.fillStyle = palette.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(30);
  const top = tabTop + 24, baseline = tabTop + tabHeight - 24;
  ctx.fillText('RANK', tabLeft + 32, top + 22);
  if (daily?.players) { ctx.globalAlpha = 0.7; ctx.fillText(`OF ${daily.players}`, tabLeft + 32, baseline); ctx.globalAlpha = 1; }
  ctx.textAlign = 'right';
  ctx.font = font(184);
  ctx.fillText(`#${rank}`, tabLeft + tabWidth - 28, baseline);
  ctx.restore();
}
