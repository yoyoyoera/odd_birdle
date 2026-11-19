// Motif for this daily challenge, drawn over the crowd on the daily card. (Placeholder: to be designed.)
// area = { x, y, w, h } is the part of the card above the score panel (y 0 to ~560) that stays visible.
export function drawMotif(ctx, { palette, width, height, seed, area, won }) {
  ctx.save();
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(area.x + area.w / 2 - 60, area.y + area.h / 2 - 60, 120, 120);
  ctx.restore();
}
