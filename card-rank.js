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
  const tabWidth = 580, tabHeight = 232;
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
  ctx.font = font(66);
  const top = tabTop + 30, baseline = tabTop + tabHeight - 30;
  ctx.fillText('RANK', tabLeft + 36, top + 46);
  ctx.globalAlpha = 0.7; ctx.fillText('TODAY', tabLeft + 36, baseline); ctx.globalAlpha = 1;
  ctx.textAlign = 'right';
  ctx.font = font(236);
  ctx.fillText(`#${rank}`, tabLeft + tabWidth - 26, baseline);
  ctx.restore();
}
