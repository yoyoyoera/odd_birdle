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
const faultReactions = ['Pardon?', 'LOL', 'Oops!', 'Nice try.', 'Wrong way.'];
const cpuLevels = [
  { speed: 0.65, spikeChance: 0.04 },
  { speed: 0.82, spikeChance: 0.12 },
  { speed: 1, spikeChance: 0.25 },
  { speed: 1.16, spikeChance: 0.40 },
  { speed: 1.60, spikeChance: 0.60 }
];
const effects = [
  { id: 'shock', label: 'SHOCK', duration: 0.55 },
  { id: 'invisible', label: 'INVISIBLE', duration: 1 },
  { id: 'wind', label: 'GUST', duration: 0.65 },
  { id: 'balloon', label: 'BALLOON', duration: 2 },
  { id: 'freeze', label: 'FREEZE' }
];


export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function shuttleOutline({ shape, size, angle }) {
  const kind = shapes[shape];
  const scale = size * kind.vertexScale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return kind.rings.map(ring => ring.map(([x, y]) => ({
    x: (x * cos - y * sin) * scale,
    y: (x * sin + y * cos) * scale
  })));
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

function outlineContact(from, to, radius, x, y, rings) {
  const start = { x: from.x - x, y: from.y - y };
  const end = { x: to.x - x, y: to.y - y };
  const radiusSquared = radius * radius;
  let inside = false;
  for (const ring of rings) {
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

function flightProfile(kind, size) {
  const sizeOffset = (size - 21) / 13;
  return { gravity: baseGravity * kind.fall, airDrag: kind.drag * (1 + sizeOffset * 0.16) };
}

function advanceFlight(body, dt, scale, drag, terminalVelocity) {
  body.x += body.vx * scale;
  body.y += terminalVelocity * dt + (body.vy - terminalVelocity) * scale;
  body.vx *= drag;
  body.vy = terminalVelocity + (body.vy - terminalVelocity) * drag;
}

function flightScale(time, airDrag) {
  return -Math.expm1(-airDrag * time) / airDrag;
}

function swingVelocity(x, y) {
  const lift = 130 * (1 - clamp(Math.hypot(x, y) / 400, 0, 1));
  return { vx: clamp(x * 0.92, -1800, 1800), vy: clamp(y * 0.82 - lift, -880, 1100) };
}

export function swingMotion(from, to) {
  const elapsed = Math.max(8, to.time - from.time) / 1000;
  return { vx: (to.x - from.x) / elapsed, vy: (to.y - from.y) / elapsed };
}

export function isSwing({ vx, vy }) {
  return Math.hypot(vx, vy) >= 110;
}

export function contactMotion(racket, time) {
  const age = time - racket.time;
  return age >= 0 && age <= 48 && isSwing(racket) ? racket : { vx: 0, vy: 0 };
}

export function racketTouches(shuttle, from, to = from) {
  return outlineContact(from, to, racketRadius, shuttle.x, shuttle.y, shuttleOutline(shuttle));
}

export function supportedShuttleY(pose, from, to) {
  if (pose.y > from.y || to.y > from.y) return undefined;
  const rings = shuttleOutline(pose);
  const overlapsAt = y => outlineContact(to, to, racketRadius, pose.x, y, rings);
  if (!overlapsAt(pose.y)) return undefined;

  // Move only as far up as needed for the racket and outline to separate.
  let low = pose.y - pose.size * 2 - racketRadius * 2;
  let high = pose.y;
  for (let i = 0; i < 12; i++) {
    const y = (low + high) / 2;
    if (overlapsAt(y)) high = y;
    else low = y;
  }
  return low;
}

export function projectStrike(pose, motion, seconds) {
  const velocity = swingVelocity(motion.vx, motion.vy);
  const { gravity, airDrag } = flightProfile(shapes[pose.shape], pose.baseSize);
  const result = { ...pose, ...velocity };
  advanceFlight(result, seconds, flightScale(seconds, airDrag), Math.exp(-airDrag * seconds), gravity / airDrag);
  result.angle += (velocity.vx / 92 + 1.4) * seconds;
  return result;
}

export function createGame({ withCpu = false } = {}) {
  let winner;
  let message = '';
  let eventText = '';
  let eventWind = false;
  let score;
  let pointsToWin;
  let shape = -1;
  let sizeTier = -1;
  let shuttle;
  let outline;
  let outlinePoints;
  const rackets = {};
  const touching = {};
  let cpu;
  let cpuLevel;
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
  let flight = 0;
  let strike;
  let support;
  let pendingLanding;
  let settledSize;

  const opponent = (side) => side === 'left' ? 'right' : 'left';

  function serve() {
    settledSize = undefined;
    flight++;
    pendingLanding = undefined;
    support = undefined;
    strike = undefined;
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

  function restart(openingCountdown = 0) {
    winner = undefined;
    score = { left: 0, right: 0 };
    pointsToWin = 5 + Math.floor(Math.random() * 11);
    if (withCpu) cpuLevel = 1 + Math.floor(Math.random() * cpuLevels.length);
    rackets.left = rackets.right = undefined;
    server = 'left';
    clearEffect();
    scheduleEvent();
    serve();
    if (openingCountdown > 0) {
      phase = 'starting';
      phaseTime = openingCountdown;
      showEvent(String(openingCountdown));
    }
  }

  function finishPoint(side, reason) {
    if (countdown > 0) scheduleEvent();
    settledSize = shuttlePose().size;
    clearEffect();
    updateOutline();
    if (reason === 'out') showEvent('out');
    const matchPoint = Math.max(score.left, score.right) === pointsToWin - 1;
    if (!matchPoint && (reason === 'own court' || reason === 'Net')) {
      showEvent(faultReactions[Math.floor(Math.random() * faultReactions.length)]);
    }
    if (!matchPoint && reason === 'missed serve') showEvent('Sleepy?');
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
    if (activeEffect?.id === 'freeze' || activeEffect?.id === 'balloon') flight++;
    activeEffect = undefined;
    cpuPrediction = undefined;
    showEvent('');
  }

  function startEffect() {
    const effect = effects[Math.floor(Math.random() * effects.length)];
    activeEffect = { id: effect.id, remaining: effect.duration ?? (0.5 + Math.random() * 4.5) };
    let label = effect.label;
    switch (activeEffect.id) {
      case 'freeze':
        flight++;
        flash = 0;
        for (const racket of Object.values(rackets)) {
          if (racket) Object.assign(racket, { vx: 0, vy: 0 });
        }
        break;
      case 'balloon':
        flight++;
        break;
      case 'shock':
        flight++;
        shuttle.vx = 0;
        shuttle.vy = Math.max(0, shuttle.vy) + 135;
        break;
      case 'invisible':
        cpuPrediction = { x: shuttle.x, y: shuttle.y, vx: shuttle.vx, vy: shuttle.vy };
        flash = 0;
        break;
      case 'wind': {
        flight++;
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
    support = undefined;
    strike = undefined;
    flight++;
    pendingLanding = undefined;
    shuttle.vx = vx;
    shuttle.vy = vy;
    shuttle.spin = vx / 92 + 1.4;
    lastHitter = hitter;
    hitCooldown = 0.14;
    flash = 0.22;
    message = 'Rally in progress';
  }

  function playerHit(side, swingX, swingY) {
    const { vx, vy } = swingVelocity(swingX, swingY);
    launch(vx, vy, side);
  }

  function onSide(side) {
    return (shuttle.x < center ? 'left' : 'right') === side;
  }

  function shuttlePose() {
    return { x: shuttle.x, y: shuttle.y, shape, angle: shuttle.angle,
      size: settledSize ?? shuttle.size * (activeEffect?.id === 'balloon' ? 2 : 1) };
  }

  function updateOutline() {
    outline = shuttleOutline(shuttlePose());
    outlinePoints = outline.flat();
  }

  function racketContact(from, to) {
    return outlineContact(from, to, racketRadius, shuttle.x, shuttle.y, outline);
  }

  function checkContact(side, from, to, swingX, swingY) {
    const onCourt = onSide(side);
    const overlap = onCourt && racketContact(to, to);
    if (phase === 'live' && onCourt && hitCooldown <= 0 &&
        (!touching[side] || (support === side && isSwing({ vx: swingX, vy: swingY }))) && racketContact(from, to)) {
      playerHit(side, swingX, swingY);
      touching[side] = overlap;
    } else if (!overlap) {
      touching[side] = false;
    }
  }

  function contactFrame() {
    if (phase !== 'live' || pendingLanding || activeEffect?.id === 'freeze') return undefined;
    return { ...shuttlePose(), flight, canHit: hitCooldown <= 0 };
  }

  function onlineContact(side, from, to, frame, hold = false) {
    if (phase !== 'live' || activeEffect?.id === 'freeze' || !frame || frame.flight !== flight) return;
    if ((frame.x < center ? 'left' : 'right') !== side) {
      touching[side] = false;
      return;
    }
    const rings = shuttleOutline(frame);
    const overlaps = outlineContact(to, to, racketRadius, frame.x, frame.y, rings);
    if (touching[side] && !(support === side && !hold && isSwing(to))) {
      if (!overlaps) touching[side] = false;
      return;
    }
    if (!frame.canHit || !outlineContact(from, to, racketRadius, frame.x, frame.y, rings)) {
      return;
    }
    if (!hold && !isSwing(to)) {
      return;
    }
    // Start at the same contact pose the striker saw, then catch up to the server clock.
    Object.assign(shuttle, { x: frame.x, y: frame.y, angle: frame.angle });
    playerHit(side, to.vx, to.vy);
    if (Number.isFinite(frame.time)) {
      strike = { flight, time: frame.time, fromFlight: frame.flight, side,
        racket: { x: to.x, y: to.y },
        pose: { ...shuttlePose(), baseSize: shuttle.size }, motion: { vx: to.vx, vy: to.vy } };
    }
    touching[side] = overlaps;
    updateOutline();
    let elapsed = frame.age ?? 0;
    while (elapsed > 1e-9 && phase === 'live' && !pendingLanding) {
      const slice = Math.min(elapsed, step);
      advanceShuttle(slice);
      elapsed -= slice;
    }
  }

  function holdRacket(side, frame, time) {
    const racket = rackets[side];
    if (racket) {
      if (Number.isFinite(frame?.time)) racket.seenTime = frame.time;
      onlineContact(side, racket, { ...racket, ...contactMotion(racket, time) }, frame, true);
    }
  }

  function supportShuttle(side, from, to) {
    if (phase !== 'live' || pendingLanding || !onSide(side)) return false;
    const y = supportedShuttleY(shuttlePose(), from, to);
    if (y === undefined) return false;
    shuttle.y = y;
    shuttle.vy = Math.min(shuttle.vy, to.vy, 0);
    if (support !== side) {
      support = side;
      strike = undefined;
    }
    touching[side] = true;
    updateOutline();
    return true;
  }

  function moveRacket(side, input, frame) {
    if (phase !== 'live' && phase !== 'between' && phase !== 'starting') return;
    if (!input) {
      rackets[side] = undefined;
      if (support === side) support = undefined;
      touching[side] = false;
      return;
    }
    const next = {
      x: side === 'left' ? clamp(input.x, 0, center - racketRadius)
        : clamp(input.x, center + racketRadius, width),
      y: clamp(input.y, 0, floor),
      time: input.time,
      seenTime: frame?.time,
      vx: 0,
      vy: 0,
      age: 0
    };
    const previous = rackets[side] ?? next;
    rackets[side] = next;
    if (activeEffect?.id === 'freeze') return;
    Object.assign(next, swingMotion(previous, next));
    if (next.vy < 0 && !isSwing(next) && supportShuttle(side, previous, next)) return;
    if (withCpu) checkContact(side, previous, next, next.vx, next.vy);
    else onlineContact(side, previous, next, frame);
  }

  function moveCpu(dt) {
    const tracked = cpuPrediction ?? shuttle;
    const defending = tracked.x >= center && tracked.vy > 0;
    const anticipates = cpuLevel === 5 && lastHitter === 'left' && tracked.vy > 0;
    const lead = anticipates ? clamp((floor - tracked.y) / tracked.vy, 0, 0.14) : 0;
    const projectedX = tracked.x + tracked.vx * flightScale(lead, shuttle.airDrag);
    const preparing = anticipates && tracked.vx > 0 && projectedX >= center;
    const tracking = defending || preparing;
    const targetX = tracking ? clamp(defending ? tracked.x : projectedX, center + racketRadius, rightLine - 24) : 660;
    const targetY = tracking ? clamp(tracked.y + 24, 205, floor - 14) : 300;
    const { speed, spikeChance } = cpuLevels[cpuLevel - 1];
    const travel = speed * dt;
    cpu.x += clamp(targetX - cpu.x, -290 * travel, 290 * travel);
    cpu.y += clamp(targetY - cpu.y, -340 * travel, 340 * travel);
    if (defending && tracked.x <= rightLine && shuttle.x >= center && shuttle.x <= rightLine &&
        lastHitter !== 'right' && hitCooldown <= 0 &&
        racketContact(cpu, cpu)) {
      if (lastHitter === 'left' && shuttle.y <= netTop - 65 && Math.random() < spikeChance) {
        const target = 205 + Math.random() * 120;
        const vy = 110;
        const vx = velocityToLandAt(target, vy);
        // Budget for the rotating outline until it has fully cleared the net.
        const radius = Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y)));
        const netFraction = (shuttle.x - center + radius + 2) / (shuttle.x - target);
        const clearanceY = shuttle.y + (floor - shuttle.y) * netFraction + radius;
        if (clearanceY < netTop && Math.abs(vx) <= 1050) {
          launch(vx, vy, 'right');
          return;
        }
      }
      const vy = -485 - Math.random() * 45;
      launch(velocityToLandAt(160 + Math.random() * 165, vy), vy, 'right');
    }
  }

  function advanceShuttle(dt) {
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
      previousY + (shuttle.y - previousY) * (center - previousX) / (shuttle.x - previousX), outline);
    if (lastHitter && (crossesNet || outlineContact(netStart, netEnd, 2, shuttle.x, shuttle.y, outline))) {
      finishPoint(opponent(lastHitter), 'Net');
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
      const winner = out ? opponent(lastHitter ?? server) : opponent(landingSide);
      let reason = 'Landed';
      if (out) reason = 'out';
      else if (!lastHitter) reason = 'missed serve';
      else if (landingSide === lastHitter) reason = 'own court';
      if (withCpu) finishPoint(winner, reason);
      else pendingLanding = { winner, reason, remaining: 0.24 };
      return;
    }

  }

  function simulate(dt) {
    if (phase === 'ready' || phase === 'finished') return;
    if (phase === 'starting') {
      phaseTime -= dt;
      if (phaseTime <= 1e-9) {
        phase = 'live';
        showEvent('');
      } else {
        showEvent(String(Math.ceil(phaseTime - 1e-9)));
      }
      return;
    }
    if (phase === 'between') {
      phaseTime -= dt;
      if (phaseTime <= 0) serve();
      return;
    }

    if (pendingLanding) {
      pendingLanding.remaining -= dt;
      if (pendingLanding.remaining <= 0) {
        const { winner, reason } = pendingLanding;
        pendingLanding = undefined;
        finishPoint(winner, reason);
      }
      return;
    }

    updateEvent(dt);
    if (activeEffect?.id === 'freeze') return;
    advanceShuttle(dt);
    if (support) {
      const racket = rackets[support];
      if (!racket || !supportShuttle(support, racket, { ...racket, vy: 0 })) {
        if (!racket || !onSide(support) || shuttle.y > racket.y ||
            !outlineContact(racket, racket, racketRadius + 3, shuttle.x, shuttle.y, outline)) support = undefined;
      }
    }
    if (phase !== 'live' || pendingLanding) return;

    if (withCpu) {
      const side = 'left';
      const racket = rackets[side];
      if (racket) {
        racket.age += dt;
        const remainingSwing = Math.max(0, 1 - racket.age / 0.085);
        checkContact(side, racket, racket, racket.vx * remainingSwing, racket.vy * remainingSwing);
      }
      moveCpu(dt);
    }
  }

  function view() {
    const frozen = activeEffect?.id === 'freeze';
    const visible = shuttle && phase !== 'starting' && activeEffect?.id !== 'invisible';
    const position = (racket) => racket && { x: racket.x, y: racket.y, seenTime: racket.seenTime };
    return {
      phase, score, message, winner, eventText, eventWind, flash, frozen, support, cpuLevel,
      strike: strike?.flight === flight ? strike : undefined,
      shake: activeEffect?.id === 'shock' ? activeEffect.remaining : 0,
      shuttle: visible ? { ...shuttlePose(), flight, baseSize: shuttle.size, canHit: hitCooldown <= 0 && !pendingLanding && !frozen } : undefined,
      left: position(rackets.left),
      right: position(cpu ?? rackets.right)
    };
  }

  return { restart, moveRacket, holdRacket, contactFrame, simulate, view };
}
