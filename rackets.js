// The rackets of the shop (docs/PLAN-mobile-app.md, section 11). A racket is a shape, and the shape is also its hitbox: it is
// stored as a few circles around the racket's centre that together fill the shape, and the game asks each circle whether it
// touches the shuttle. Every racket is scaled to the area of the plain one (a circle of radius 22), so a shape changes the
// reach, not the size.
export const plainRadius = 22;
const plainArea = Math.PI * plainRadius * plainRadius;

const area = polygon => Math.abs(polygon.reduce((sum, a, i) => {
  const b = polygon[(i + 1) % polygon.length];
  return sum + (a.x * b.y - b.x * a.y);
}, 0)) / 2;

const around = (steps, point) => Array.from({ length: steps }, (_, i) => point(i * Math.PI * 2 / steps));

// Unit shapes (any size; they are scaled to the plain racket's area below).
const shapes = {
  circle: () => around(72, t => ({ x: Math.cos(t), y: Math.sin(t) })),
  oval: () => around(72, t => ({ x: 0.62 * Math.cos(t), y: Math.sin(t) })),
  wide: () => around(72, t => ({ x: Math.cos(t), y: 0.62 * Math.sin(t) })),
  // A square with rounded corners.
  square: () => {
    const corner = 0.3;
    const centres = [[1 - corner, 1 - corner], [-1 + corner, 1 - corner], [-1 + corner, -1 + corner], [1 - corner, -1 + corner]];
    return centres.flatMap(([cx, cy], q) => Array.from({ length: 10 }, (_, i) => {
      const angle = q * Math.PI / 2 + i / 9 * Math.PI / 2;
      return { x: cx + corner * Math.cos(angle), y: cy + corner * Math.sin(angle) };
    }));
  },
  hexagon: () => around(6, t => ({ x: Math.cos(t + Math.PI / 6), y: Math.sin(t + Math.PI / 6) })),
  // An egg: wider at the top, like the head of a tennis racket.
  egg: () => around(72, t => ({ x: 0.72 * Math.cos(t) * (1 - 0.2 * Math.sin(t)), y: Math.sin(t) }))
};

function scaledTo(polygon, wanted) {
  const factor = Math.sqrt(wanted / area(polygon));
  return polygon.map(point => ({ x: point.x * factor, y: point.y * factor }));
}

const distanceToEdge = (polygon, x, y) => {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - a.x - dx * along, y - a.y - dy * along));
  }
  return best;
};

const inside = (polygon, x, y) => {
  let on = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
};

// A shape as the circles that fill it: every circle that fits inside, with the circles inside another dropped.
export function partsOf(polygon, grid = 3.5) {
  const xs = polygon.map(point => point.x);
  const ys = polygon.map(point => point.y);
  const candidates = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += grid) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += grid) {
      if (!inside(polygon, x, y)) continue;
      const r = distanceToEdge(polygon, x, y);
      if (r >= 2) candidates.push({ x, y, r });
    }
  }
  candidates.sort((a, b) => b.r - a.r);
  const kept = [];
  for (const circle of candidates) {
    if (!kept.some(other => Math.hypot(circle.x - other.x, circle.y - other.y) + circle.r <= other.r + 0.2)) kept.push(circle);
  }
  return kept.map(circle => ({ x: +circle.x.toFixed(1), y: +circle.y.toFixed(1), r: +circle.r.toFixed(1) }));
}

function racket(id, name, price, shape) {
  const polygon = scaledTo(shapes[shape](), plainArea);
  const parts = shape === 'circle' ? [{ x: 0, y: 0, r: plainRadius }] : partsOf(polygon);
  return {
    id, name, price, parts, polygon,
    halfX: Math.max(...parts.map(part => Math.abs(part.x) + part.r)),
    halfY: Math.max(...parts.map(part => Math.abs(part.y) + part.r))
  };
}

export const catalog = [
  racket('classic', 'Classic', 0, 'circle'),
  racket('oval', 'Oval', 90, 'oval'),
  racket('wide', 'Wide', 120, 'wide'),
  racket('square', 'Square', 200, 'square'),
  racket('hex', 'Hex', 150, 'hexagon'),
  racket('egg', 'Egg', 150, 'egg')
];

export const racketById = id => catalog.find(item => item.id === id);
export const plainRacket = catalog[0];

// Until the accounts hold a wallet, the app assumes the player already owns these (a stand-in for the server's list).
export const starterOwned = ['classic', 'oval', 'wide', 'square'];

// The edge of the shape as a closed polygon, for drawing.
export function outlineOf(parts, steps = 72) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const angle = i * Math.PI * 2 / steps;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let reach = 0;
    for (const part of parts) {
      const along = part.x * dx + part.y * dy;
      const discriminant = along * along - (part.x * part.x + part.y * part.y) + part.r * part.r;
      if (discriminant >= 0) reach = Math.max(reach, along + Math.sqrt(discriminant));
    }
    points.push({ x: dx * reach, y: dy * reach });
  }
  return points;
}

// Rackets in the shop today: three of the catalogue, chosen by the date, so everyone sees the same shelf and it works offline.
export function shelfFor(date, count = 3) {
  const sale = catalog.filter(item => item.price > 0);
  let seed = 0;
  for (const char of String(date)) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const order = [...sale];
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(count, order.length));
}
