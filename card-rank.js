// Emphasis for the top three of the day on the daily card. (Placeholder: to be designed.)
// rank is 1, 2 or 3; panel = { x, y, w, h } is the score panel; the card is 1080x1350.
const accents = { 1: '#e9c25a', 2: '#c9d1d6', 3: '#cd8b5a' };

export const rankAccent = rank => accents[rank];

// Called after the panel is drawn; draws medals, crowns, frames, ribbons: whatever makes the rank stand out.
export function drawRankFlourish(ctx, { rank, palette, panel, width, height }) {
  ctx.save();
  ctx.strokeStyle = accents[rank];
  ctx.lineWidth = 10;
  ctx.strokeRect(panel.x - 5, panel.y - 5, panel.w + 10, panel.h + 10);
  ctx.restore();
}
