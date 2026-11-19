// Windy Day: a steady wind blows one way all match. Over the cheering crowd: a few soft wind streaks with curled ends,
// three leaves caught in them, and a small ink badge with the wind sign in the top corner. The direction comes from the
// seed, so some cards blow left and some right.
function randomFrom(seed) {
  let state = (Math.floor(seed) % 2147483646) + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// A streak that starts at (x, y), runs `length` to the right with a gentle wobble and curls up at the end.
function streak(ctx, x, y, length, curl) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + length * 0.35, y - 14, x + length * 0.7, y + 16, x + length - curl, y);
  ctx.arc(x + length - curl, y - curl, curl, Math.PI / 2, -Math.PI * 0.85, true);
  ctx.stroke();
}

function leaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha *= 0.6;
  ctx.fillRect(-size * 0.9, -1.5, size * 1.8, 3);
  ctx.restore();
}

export function drawMotif(ctx, { palette, width, seed, area }) {
  const random = randomFrom(seed * 13 + 5);
  const blowsRight = Math.floor(seed) % 2 === 0;
  ctx.save();
  if (!blowsRight) { ctx.translate(width, 0); ctx.scale(-1, 1); }
  ctx.lineCap = 'round';

  // Wind streaks across the crowd: wide, light and a little uneven, some pale, some dark.
  const lanes = [90, 205, 320, 435];
  lanes.forEach((y, index) => {
    const x = -40 + random() * 260;
    const length = 480 + random() * 360;
    ctx.lineWidth = 13 + random() * 7;
    ctx.strokeStyle = index % 2 ? palette.court : palette.ink;
    ctx.globalAlpha = index % 2 ? 0.8 : 0.3;
    streak(ctx, x, y + random() * 30, length, 26 + random() * 16);
  });

  // Leaves riding the wind.
  ctx.globalAlpha = 0.9;
  leaf(ctx, 640 + random() * 120, 120 + random() * 60, 26, -0.4, '#a9d678');
  leaf(ctx, 300 + random() * 100, 300 + random() * 40, 22, 0.5, '#cf936b');
  leaf(ctx, 820 + random() * 100, 390 + random() * 40, 24, -0.2, '#a9d678');
  ctx.restore();

  // The badge: always in the top-left corner and always readable, so it is drawn unflipped.
  const size = 168, x = 56, y = 56;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 30);
  ctx.fill();
  ctx.strokeStyle = palette.court;
  ctx.lineCap = 'round';
  ctx.lineWidth = 11;
  [[0.3, 0.72, 0.1], [0.5, 0.88, 0.14], [0.7, 0.62, 0.09]].forEach(([fy, reach, curl]) => {
    streak(ctx, x + size * 0.16, y + size * fy, size * reach * 0.8, size * curl);
  });
  ctx.restore();
}
