import { brandShuttles } from './brand-shuttles.js';

// Vertices are shared by the renderer and collision checks.
const shapes = [
  { fall: 0.98, drag: 0.61, vertices: [[0, -1], [0.94, 0.76], [-0.94, 0.76]] },
  { fall: 1.06, drag: 0.48, vertices: Array.from({ length: 32 }, (_, i) => {
    const angle = i * Math.PI / 16;
    return [Math.cos(angle), Math.sin(angle)];
  }) },
  { fall: 1.04, drag: 0.55, vertices: [[-0.72, -0.72], [0.72, -0.72], [0.72, 0.72], [-0.72, 0.72]] },
  { fall: 0.92, drag: 0.76, vertices: [[-1.38, -0.30], [1.38, -0.30], [1.38, 0.30], [-1.38, 0.30]] },
  { fall: 1.02, drag: 0.53, vertices: [[0, -1.13], [0.75, 0], [0, 1.13], [-0.75, 0]] },
  { fall: 0.99, drag: 0.59, vertices: [[-0.88, -0.50], [0, -1], [0.88, -0.50], [0.88, 0.50], [0, 1], [-0.88, 0.50]] },
  { fall: 0.94, drag: 0.67, vertices: [[-0.9, -0.85], [-0.23, -0.85], [0, -0.18], [0.23, -0.85],
    [0.9, -0.85], [0.4, 0.45], [0, 0.95], [-0.4, 0.45]] },
  ...brandShuttles
].map(kind => {
  // Use the longest distance across each silhouette so rotation and aspect
  // ratio cannot turn a small tier into the same size as a large one.
  const rings = kind.rings ?? [kind.vertices];
  const vertices = rings.flat();
  const diameter = Math.max(...vertices.flatMap(([x, y]) =>
    vertices.map(([otherX, otherY]) => Math.hypot(x - otherX, y - otherY))
  ));
  return { ...kind, rings, vertexScale: 2 / diameter };
});
const shuttleSizes = [11, 21, 34];
export const width = 900;
export const height = 500;
export const center = width / 2;
export const floor = 448;
export const netTop = 342;
const netStart = { x: center, y: netTop };
const netEnd = { x: center, y: floor };
export const leftLine = 64;
export const rightLine = width - leftLine;
export const racketRadius = 22;
const baseGravity = 760;
export const step = 1 / 120;
const pointsToWin = 7;
const effects = [
  { id: 'shock', label: 'SHOCK', duration: 0.55 },
  { id: 'invisible', label: 'INVISIBLE', duration: 1 },
  { id: 'wind', label: 'GUST', duration: 0.65 },
  { id: 'balloon', label: 'BALLOON', duration: 2 }
];


export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createGame({ withCpu = false } = {}) {
  let winner;
  let message = '';
  let eventText = '';
  let eventWind = false;
  let score;
  let shape = -1;
  let sizeTier = -1;
  let shuttle;
  let outline;
  let outlinePoints;
  const rackets = {};
  const touching = {};
  let cpu;
  let server;
  let lastHitter;
  let phase = 'ready';
  let phaseTime;
  let hitCooldown;
  let flash;
  let eventWait;
  let countdown;
  let activeEffect;
  let cpuPrediction;

  const opponent = (side) => side === 'left' ? 'right' : 'left';

  function flightProfile(kind, size) {
    const sizeOffset = (size - 21) / 13;
    return { gravity: baseGravity * kind.fall, airDrag: kind.drag * (1 + sizeOffset * 0.16) };
  }

  function serve() {
    showEvent('');
    shape = shape < 0
      ? Math.floor(Math.random() * shapes.length)
      : (shape + 1 + Math.floor(Math.random() * (shapes.length - 1))) % shapes.length;
    const x = server === 'left' ? 245 : 660;
    sizeTier = sizeTier < 0
      ? Math.floor(Math.random() * shuttleSizes.length)
      : (sizeTier + 1 + Math.floor(Math.random() * (shuttleSizes.length - 1))) % shuttleSizes.length;
    const size = shuttleSizes[sizeTier];
    shuttle = { x, y: 56, vx: 0, vy: 35, angle: 0, spin: 0.8, size, ...flightProfile(shapes[shape], size) };
    updateOutline();
    cpu = withCpu ? { x: 660, y: 300 } : undefined;
    phase = 'live';
    lastHitter = undefined;
    hitCooldown = 0;
    touching.left = touching.right = false;
    flash = 0;
    message = server + ' serve';
  }

  function restart() {
    winner = undefined;
    score = { left: 0, right: 0 };
    rackets.left = rackets.right = undefined;
    server = 'left';
    clearEffect();
    scheduleEvent();
    serve();
  }

  function finishPoint(side, reason) {
    if (countdown > 0) scheduleEvent();
    clearEffect();
    updateOutline();
    if (reason === 'out') showEvent('out');
    score[side]++;
    server = side;
    if (score[side] === pointsToWin) {
      phase = 'finished';
      message = '';
      winner = side;
      return;
    }
    phase = 'between';
    phaseTime = 0.85;
    message = reason;
  }

  function showEvent(message, wind = false) {
    eventText = message;
    eventWind = wind;
  }

  function scheduleEvent() {
    countdown = 0;
    eventWait = 3 + Math.random() * 4;
  }

  function clearEffect() {
    activeEffect = undefined;
    cpuPrediction = undefined;
    showEvent('');
  }

  function startEffect() {
    const effect = effects[Math.floor(Math.random() * effects.length)];
    activeEffect = { id: effect.id, remaining: effect.duration };
    let label = effect.label;
    switch (activeEffect.id) {
      case 'shock':
        shuttle.vx = 0;
        shuttle.vy = Math.max(0, shuttle.vy) + 135;
        break;
      case 'invisible':
        cpuPrediction = { x: shuttle.x, y: shuttle.y, vx: shuttle.vx, vy: shuttle.vy };
        flash = 0;
        break;
      case 'wind': {
        const direction = Math.random() < 0.5 ? -1 : 1;
        shuttle.vx = clamp(shuttle.vx + direction * 290, -1800, 1800);
        label += direction < 0 ? ' ←' : ' →';
        break;
      }
    }
    showEvent(label, effect.id === 'wind');
    scheduleEvent();
  }

  function updateEvent(dt) {
    if (activeEffect) {
      activeEffect.remaining -= dt;
      if (activeEffect.remaining <= 1e-9) clearEffect();
      return;
    }
    // Before a countdown, short rallies still contribute to the waiting time.
    if (!lastHitter) return;
    if (countdown > 0) {
      countdown -= dt;
      if (countdown <= 1e-9) {
        startEffect();
        return;
      }
    } else {
      eventWait -= dt;
      if (eventWait > 0) return;
      countdown = 3;
    }
    showEvent(String(Math.ceil(countdown - 1e-9)));
  }

  function flightScale(time, airDrag) {
    return -Math.expm1(-airDrag * time) / airDrag;
  }

  function velocityToLandAt(targetX, vy) {
    const { gravity, airDrag } = shuttle;
    const terminalVelocity = gravity / airDrag;
    const landingY = floor - Math.max(...outlinePoints.map(point => point.y));
    let low = 0;
    let high = 3;
    for (let i = 0; i < 12; i++) {
      const time = (low + high) / 2;
      const y = shuttle.y + terminalVelocity * time + (vy - terminalVelocity) * flightScale(time, airDrag);
      if (y < landingY) low = time;
      else high = time;
    }
    return (targetX - shuttle.x) / flightScale(high, airDrag);
  }

  function launch(vx, vy, hitter) {
    shuttle.vx = vx;
    shuttle.vy = vy;
    shuttle.spin = vx / 92 + 1.4;
    lastHitter = hitter;
    hitCooldown = 0.14;
    flash = 0.22;
    message = '랠리 중';
  }

  function playerHit(side, swingX, swingY) {
    const speed = Math.hypot(swingX, swingY);
    const lift = 130 * (1 - clamp(speed / 400, 0, 1));
    launch(clamp(swingX * 0.92, -1800, 1800),
      clamp(swingY * 0.82 - lift, -880, 1100), side);
  }

  function onSide(side) {
    return (shuttle.x < center ? 'left' : 'right') === side;
  }

  function updateOutline() {
    const kind = shapes[shape];
    const size = shuttle.size * kind.vertexScale * (activeEffect?.id === 'balloon' ? 2 : 1);
    const cos = Math.cos(shuttle.angle);
    const sin = Math.sin(shuttle.angle);
    outline = kind.rings.map(ring => ring.map(([x, y]) => ({
      x: (x * cos - y * sin) * size,
      y: (x * sin + y * cos) * size
    })));
    outlinePoints = outline.flat();
  }

  function pointSegmentDistanceSquared(point, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : clamp(
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1
    );
    return (point.x - from.x - dx * t) ** 2 + (point.y - from.y - dy * t) ** 2;
  }

  function cross(from, to, point) {
    return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  }

  function outlineContact(from, to, radius, x = shuttle.x, y = shuttle.y) {
    const start = { x: from.x - x, y: from.y - y };
    const end = { x: to.x - x, y: to.y - y };
    const radiusSquared = radius * radius;
    let inside = false;
    for (const ring of outline) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if ((a.y > start.y) !== (b.y > start.y) &&
            start.x < a.x + (b.x - a.x) * (start.y - a.y) / (b.y - a.y)) {
          inside = !inside;
        }
        if (cross(start, end, a) * cross(start, end, b) < 0 &&
            cross(a, b, start) * cross(a, b, end) < 0) return true;
        if (pointSegmentDistanceSquared(a, start, end) <= radiusSquared ||
            pointSegmentDistanceSquared(start, a, b) <= radiusSquared ||
            pointSegmentDistanceSquared(end, a, b) <= radiusSquared) return true;
      }
    }
    return inside;
  }

  function racketContact(from, to) {
    return outlineContact(from, to, racketRadius);
  }

  function checkContact(side, from, to, swingX, swingY) {
    const onCourt = onSide(side);
    const overlap = onCourt && racketContact(to, to);
    if (phase === 'live' && onCourt && hitCooldown <= 0 &&
        !touching[side] && racketContact(from, to)) {
      playerHit(side, swingX, swingY);
      touching[side] = overlap;
    } else if (!overlap) {
      touching[side] = false;
    }
  }

  function moveRacket(side, input) {
    if (phase !== 'live' && phase !== 'between') return;
    if (!input) {
      rackets[side] = undefined;
      touching[side] = false;
      return;
    }
    const next = {
      x: side === 'left' ? clamp(input.x, 0, center - racketRadius)
        : clamp(input.x, center + racketRadius, width),
      y: clamp(input.y, 0, floor),
      time: input.time,
      vx: 0,
      vy: 0,
      age: 0
    };
    const previous = rackets[side] ?? next;
    const elapsed = Math.max(8, next.time - previous.time) / 1000;
    next.vx = (next.x - previous.x) / elapsed;
    next.vy = (next.y - previous.y) / elapsed;
    rackets[side] = next;
    checkContact(side, previous, next, next.vx, next.vy);
  }

  function moveCpu(dt) {
    const tracked = cpuPrediction ?? shuttle;
    const defending = tracked.x >= center && tracked.vy > 0;
    const targetX = defending ? clamp(tracked.x, center + racketRadius, rightLine - 24) : 660;
    const targetY = defending ? clamp(tracked.y + 24, 205, floor - 14) : 300;
    cpu.x += clamp(targetX - cpu.x, -290 * dt, 290 * dt);
    cpu.y += clamp(targetY - cpu.y, -340 * dt, 340 * dt);
    if (defending && tracked.x <= rightLine && shuttle.x >= center && shuttle.x <= rightLine &&
        lastHitter !== 'right' && hitCooldown <= 0 &&
        racketContact(cpu, cpu)) {
      const vy = -485 - Math.random() * 45;
      launch(velocityToLandAt(160 + Math.random() * 165, vy), vy, 'right');
    }
  }

  function advanceFlight(body, dt, scale, drag, terminalVelocity) {
    body.x += body.vx * scale;
    body.y += terminalVelocity * dt + (body.vy - terminalVelocity) * scale;
    body.vx *= drag;
    body.vy = terminalVelocity + (body.vy - terminalVelocity) * drag;
  }

  function simulate(dt) {
    if (phase === 'ready' || phase === 'finished') return;
    if (phase === 'between') {
      phaseTime -= dt;
      if (phaseTime <= 0) serve();
      return;
    }

    updateEvent(dt);
    hitCooldown = Math.max(0, hitCooldown - dt);
    flash = Math.max(0, flash - dt);
    const previousX = shuttle.x;
    const previousY = shuttle.y;
    const { gravity, airDrag } = shuttle;
    const scale = flightScale(dt, airDrag);
    const drag = Math.exp(-airDrag * dt);
    const terminalVelocity = gravity / airDrag;
    advanceFlight(shuttle, dt, scale, drag, terminalVelocity);
    if (cpuPrediction) advanceFlight(cpuPrediction, dt, scale, drag, terminalVelocity);
    shuttle.angle += shuttle.spin * dt;
    updateOutline();
    const left = Math.min(...outlinePoints.map(point => point.x));
    const right = Math.max(...outlinePoints.map(point => point.x));
    const bottom = Math.max(...outlinePoints.map(point => point.y));

    const crossesCenter = (previousX - center) * (shuttle.x - center) < 0;
    const crossesNet = crossesCenter && outlineContact(netStart, netEnd, 2, center,
      previousY + (shuttle.y - previousY) * (center - previousX) / (shuttle.x - previousX));
    if (lastHitter && (crossesNet || outlineContact(netStart, netEnd, 2))) {
      finishPoint(opponent(lastHitter), '네트');
      return;
    }
    if (lastHitter && (shuttle.x + right < 0 || shuttle.x + left > width)) {
      shuttle.x = clamp(shuttle.x, -left, width - right);
      finishPoint(opponent(lastHitter), 'out');
      return;
    }

    if (shuttle.y + bottom >= floor) {
      shuttle.y = floor - bottom;
      const out = shuttle.x < leftLine || shuttle.x > rightLine;
      const landingSide = shuttle.x < center ? 'left' : 'right';
      finishPoint(out ? opponent(lastHitter ?? server) : opponent(landingSide), out ? 'out' : '착지');
      return;
    }

    for (const side of ['left', 'right']) {
      const racket = rackets[side];
      if (!racket) continue;
      racket.age += dt;
      const remainingSwing = Math.max(0, 1 - racket.age / 0.085);
      checkContact(side, racket, racket, racket.vx * remainingSwing, racket.vy * remainingSwing);
    }
    if (withCpu) moveCpu(dt);
  }

  function view() {
    const visible = shuttle && activeEffect?.id !== 'invisible';
    const position = (racket) => racket && { x: racket.x, y: racket.y };
    return {
      phase, score, message, winner, eventText, eventWind, flash,
      shake: activeEffect?.id === 'shock' ? activeEffect.remaining : 0,
      shuttle: visible ? position(shuttle) : undefined,
      outline: visible ? outline : undefined,
      left: position(rackets.left),
      right: position(cpu ?? rackets.right)
    };
  }

  return { restart, moveRacket, simulate, view };
}
