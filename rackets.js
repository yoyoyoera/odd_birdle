// The rackets of the shop (docs/PLAN-mobile-app.md, section 11). A racket is a few circles around its centre: the shape that is
// drawn and the hitbox are the same thing, so what looks like it touches the shuttle does. Every racket covers about the same
// area as the plain one (a circle of radius 22), so a shape is a change of reach and not of size.
export const plainRadius = 22;

const circle = (x, y, r) => ({ x, y, r });
const row = (r, centres, axis) => centres.map(c => axis === 'y' ? circle(0, c, r) : circle(c, 0, r));
const grid = (r, step) => [-step, 0, step].flatMap(y => [-step, 0, step].map(x => circle(x, y, r)));

export const catalog = [
  { id: 'classic', name: 'Classic', price: 0, parts: [circle(0, 0, plainRadius)] },
  { id: 'long', name: 'Long', price: 90, parts: row(13, [-19, 0, 19], 'y') },
  { id: 'wide', name: 'Wide', price: 120, parts: row(15, [-14, 0, 14], 'x') },
  { id: 'block', name: 'Block', price: 200, parts: grid(11.5, 8) },
  { id: 'peanut', name: 'Peanut', price: 150, parts: [circle(0, -16, 15.5), circle(0, 0, 11), circle(0, 16, 15.5)] },
  { id: 'twin', name: 'Twin', price: 150, parts: [circle(-16, 0, 15.5), circle(0, 0, 11), circle(16, 0, 15.5)] }
].map(racket => ({
  ...racket,
  halfX: Math.max(...racket.parts.map(part => Math.abs(part.x) + part.r)),
  halfY: Math.max(...racket.parts.map(part => Math.abs(part.y) + part.r))
}));

export const racketById = id => catalog.find(racket => racket.id === id);
export const plainRacket = catalog[0];

// Until the accounts hold a wallet, the app assumes the player already owns these (a stand-in for the server's list).
export const starterOwned = ['classic', 'long', 'wide', 'block'];

// The edge of the shape as a closed polygon, for drawing: from the centre, how far each direction goes before it leaves every
// circle. Good for any shape that can be seen from its centre (all of these).
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
  const sale = catalog.filter(racket => racket.price > 0);
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
