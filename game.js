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
  ...brandShuttles,
  // New shapes go last so the numbers of the older ones (sent to every player) never change.
  // An L: a long bar with a foot. It is lopsided, so which end meets the racket changes as it spins.
  { label: 'L', fall: 0.97, drag: 0.6, vertices: [[-0.55, -1], [-0.05, -1], [-0.05, 0.5], [0.75, 0.5], [0.75, 1], [-0.55, 1]] }
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
export const shapeCount = shapes.length;
export const shuttleSizeOptions = [...shuttleSizes];
export const width = 900;
export const height = 500;
export const center = width / 2;
export const floor = 448;
export const netTop = 342;
const netEnd = { x: center, y: floor };
export const leftLine = 64;
export const rightLine = width - leftLine;
export const racketRadius = 22;
const baseGravity = 760;
export const step = 1 / 120;
export const faultReactions = ['Pardon?', 'LOL', 'Oops!', 'Nice try.', 'Wrong way.'];
const cpuLevels = [
  { speed: 0.65, spikeChance: 0.04, outChance: 0.15 },
  { speed: 0.82, spikeChance: 0.12, outChance: 0.08 },
  { speed: 1, spikeChance: 0.25 },
  { speed: 1.16, spikeChance: 0.40, outMargin: 32, liftChance: 0.22 },
  { speed: 1.60, spikeChance: 0.60, outMargin: 8, liftChance: 0.43, doubleLiftChance: 0.15 }
];
const netMoveSeconds = 0.7;
const netEffectSeconds = netMoveSeconds * 2 + 4;
const effects = [
  { id: 'shock', label: 'SHOCK', duration: 0.55 },
  { id: 'invisible', label: 'INVISIBLE', duration: 1 },
  { id: 'wind', label: 'GUST', duration: 1.5 },
  { id: 'balloon', label: 'BALLOON', duration: [2.5, 3] },
  { id: 'freeze', label: 'FREEZE', duration: 1.5 },
  { id: 'highNet', label: 'HIGH NET', duration: netEffectSeconds, netScale: 2 },
  { id: 'lowNet', label: 'LOW NET', duration: netEffectSeconds, netScale: 0.3 }
];
// How far the net rises or sinks, as a multiple of its height. The test page can change these.
export const defaultNetScales = { highNet: 2, lowNet: 0.3 };

// INVISIBLE: how long the shuttle shows itself after a hit, and how far off the CPU's idea of its
// height can be. The CPU sees what a player sees (the shadow's position, and the shuttle for an
// instant at each hit), so it has to guess the height; the weaker the CPU, the bigger the guess is off.
const revealSeconds = 0.12;
export const cpuSightError = level => 14 + (5 - level) * 12;
export const effectLabels = effects.map(effect => effect.label);
export const effectIds = effects.map(effect => effect.id);

// GUST: a steady wind (target air speed, units/s) in one of four directions. How strongly it
// moves the shuttle follows from drag: draggier shapes catch up with the wind sooner.
const gusts = [
  { arrow: '←', x: -560, y: 0 },
  { arrow: '→', x: 560, y: 0 },
  { arrow: '↑', x: 0, y: -1250 },
  { arrow: '↓', x: 0, y: 520 }
];
const windRamp = { rise: 0.25, fall: 0.3 };
// BALLOON: much less gravity and a gentle side-to-side sway.
const balloonGravity = 0.28;
const balloonSway = { speed: 90, hertz: 0.8, rise: 0.2, fall: 0.25 };
const noForce = Object.freeze({ x: 0, y: 0, gravity: 1, strength: 0 });

// What pushes the shuttle on top of gravity and drag, `after` seconds past a moment when the
// effect (a force: { type, duration, elapsed, ... }) had run for `force.elapsed` seconds.
// The server and the clients' hit replays both use this, so a windy flight looks the same everywhere.
export function forceAt(force, after = 0) {
  if (!force) return noForce;
  const elapsed = force.elapsed + after;
  if (elapsed >= force.duration) return noForce;
  if (force.type === 'wind') {
    const strength = clamp(Math.min(elapsed / windRamp.rise, (force.duration - elapsed) / windRamp.fall), 0, 1);
    return { x: force.x * strength, y: force.y * strength, gravity: 1, strength };
  }
  const strength = clamp(Math.min(elapsed / balloonSway.rise, (force.duration - elapsed) / balloonSway.fall), 0, 1);
  return {
    x: Math.sin(elapsed * 2 * Math.PI * balloonSway.hertz) * balloonSway.speed * strength,
    y: 0,
    gravity: 1 - (1 - balloonGravity) * strength,
    strength
  };
}


export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function netEffectTop(baseTop, elapsed, scale) {
  const progress = clamp(Math.min(elapsed / netMoveSeconds, (netEffectSeconds - elapsed) / netMoveSeconds), 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  const target = floor - (floor - baseTop) * scale;
  return baseTop + (target - baseTop) * eased;
}

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

function advanceFlight(body, dt, scale, drag, terminalVelocity, terminalX = 0) {
  body.x += terminalX * dt + (body.vx - terminalX) * scale;
  body.y += terminalVelocity * dt + (body.vy - terminalVelocity) * scale;
  body.vx = terminalX + (body.vx - terminalX) * drag;
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
  const weight = Number.isFinite(age) ? clamp(1 - age / 85, 0, 1) : 0;
  return { vx: racket.vx * weight, vy: racket.vy * weight };
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

export function projectStrike(pose, motion, seconds, force) {
  const velocity = swingVelocity(motion.vx, motion.vy);
  const { gravity, airDrag } = flightProfile(shapes[pose.shape], pose.baseSize);
  const result = { ...pose, ...velocity };
  if (!force) {
    advanceFlight(result, seconds, flightScale(seconds, airDrag), Math.exp(-airDrag * seconds), gravity / airDrag);
  } else {
    // Replay in the server's fixed steps so wind and balloon flights match it.
    for (let done = 0; done < seconds - 1e-9; done += step) {
      const dt = Math.min(step, seconds - done);
      // The server applies the force for a step after the effect clock has moved on by that step.
      const push = forceAt(force, done + dt);
      advanceFlight(result, dt, flightScale(dt, airDrag), Math.exp(-airDrag * dt), gravity * push.gravity / airDrag + push.y, push.x);
    }
  }
  result.angle += (velocity.vx / 92 + 1.4) * seconds;
  return result;
}

export function createGame({ withCpu = false, quickEvents = false } = {}) {
  let netReturn;
  let baseNetTop = netTop;
  let matchNetTop = netTop;
  const netStart = { x: center, y: matchNetTop };
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
  let cpuFollowUps = 0;
  let cpuThaw = 0;
  let reveal = 0;
  let cpuSightBias = 0;
  // Test page only: how long an effect lasts (seconds), instead of its usual time.
  const effectSeconds = {};
  const netScales = { ...defaultNetScales };
  // Test page only: pin the shuttle shape / size tier (undefined = random) and switch effects on or off.
  const shuttleChoice = { shape: undefined, size: undefined };
  let effectsOn = true;
  let cpuOutFeint;
  let flight = 0;
  let strike;
  let support;
  let pendingLanding;
  let settledSize;

  const opponent = (side) => side === 'left' ? 'right' : 'left';

  function serve() {
    settledSize = undefined;
    cpuFollowUps = 0;
    cpuOutFeint = undefined;
    flight++;
    pendingLanding = undefined;
    support = undefined;
    strike = undefined;
    showEvent('');
    shape = shuttleChoice.shape ?? (shape < 0
      ? Math.floor(Math.random() * shapes.length)
      : (shape + 1 + Math.floor(Math.random() * (shapes.length - 1))) % shapes.length);
    const x = server === 'left' ? 245 : 660;
    sizeTier = shuttleChoice.size ?? (sizeTier < 0
      ? Math.floor(Math.random() * shuttleSizes.length)
      : (sizeTier + 1 + Math.floor(Math.random() * (shuttleSizes.length - 1))) % shuttleSizes.length);
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

  function restart(openingCountdown = 0, selectedCpuLevel) {
    netReturn = undefined;
    winner = undefined;
    score = { left: 0, right: 0 };
    pointsToWin = 5 + Math.floor(Math.random() * 11);
    matchNetTop = Math.round(floor - (floor - netTop) * [1, 1.2, 1.4][Math.floor(Math.random() * 3)]);
    baseNetTop = matchNetTop;
    netStart.y = matchNetTop;
    if (withCpu) cpuLevel = Number.isInteger(selectedCpuLevel) && selectedCpuLevel >= 1 && selectedCpuLevel <= 5
      ? selectedCpuLevel : 1 + Math.floor(Math.random() * cpuLevels.length);
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
    const finishedNetTop = matchNetTop;
    clearEffect();
    if (Math.abs(finishedNetTop - baseNetTop) > 1e-6) {
      netReturn = { from: finishedNetTop, elapsed: 0 };
      matchNetTop = finishedNetTop;
      netStart.y = matchNetTop;
    }
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
    phaseTime = netReturn ? netMoveSeconds : 0.85;
    message = reason;
  }

  function showEvent(message, wind = false) {
    eventText = message;
    eventWind = wind;
  }

  function scheduleEvent() {
    countdown = 0;
    // quickEvents is for trying effects out: they come around much sooner.
    eventWait = quickEvents ? 1 + Math.random() * 1.5 : 3 + Math.random() * 4;
  }

  // The active effect as a force description a client can replay (undefined when none pushes the bird).
  function currentForce() {
    if (!activeEffect?.force) return undefined;
    return { ...activeEffect.force, elapsed: activeEffect.total - activeEffect.remaining };
  }

  function clearEffect() {
    if (['freeze', 'balloon', 'wind'].includes(activeEffect?.id)) flight++;
    if (activeEffect?.id === 'freeze') cpuThaw = 0.25;
    activeEffect = undefined;
    reveal = 0;
    matchNetTop = baseNetTop;
    netStart.y = matchNetTop;
    cpuPrediction = undefined;
    showEvent('');
  }

  function startEffect(chosen) {
    const effect = chosen ?? effects[Math.floor(Math.random() * effects.length)];
    const length = effectSeconds[effect.id] ?? (Array.isArray(effect.duration)
      ? effect.duration[0] + Math.random() * (effect.duration[1] - effect.duration[0]) : effect.duration);
    activeEffect = { id: effect.id, remaining: length, total: length, netScale: netScales[effect.id] ?? effect.netScale };
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
        activeEffect.force = { type: 'balloon', duration: length };
        break;
      case 'shock':
        flight++;
        shuttle.vx = 0;
        shuttle.vy = Math.max(0, shuttle.vy) + 135;
        break;
      case 'invisible':
        // The CPU keeps what it last saw and guesses the height from there, a little off.
        cpuSightBias = (Math.random() * 2 - 1) * cpuSightError(cpuLevel ?? 3);
        cpuPrediction = { x: shuttle.x, y: shuttle.y + cpuSightBias, vx: shuttle.vx, vy: shuttle.vy };
        reveal = 0;
        flash = 0;
        break;
      case 'wind': {
        flight++;
        const gust = gusts[Math.floor(Math.random() * gusts.length)];
        activeEffect.force = { type: 'wind', x: gust.x, y: gust.y, duration: length };
        label += ' ' + gust.arrow;
        break;
      }
    }
    showEvent(label, effect.id === 'wind');
    scheduleEvent();
  }

  function updateEvent(dt) {
    if (activeEffect) {
      activeEffect.remaining -= dt;
      if (activeEffect.netScale !== undefined) {
        matchNetTop = netEffectTop(baseNetTop, netEffectSeconds - activeEffect.remaining, activeEffect.netScale);
        netStart.y = matchNetTop;
      }
      if (activeEffect.remaining <= 1e-9) clearEffect();
      return;
    }
    if (!effectsOn) return;
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

  function landingScale(y, vy, landingY) {
    const { gravity, airDrag } = shuttle;
    const terminalVelocity = gravity / airDrag;
    let low = 0;
    let high = 3;
    for (let i = 0; i < 12; i++) {
      const time = (low + high) / 2;
      const predictedY = y + terminalVelocity * time + (vy - terminalVelocity) * flightScale(time, airDrag);
      if (predictedY < landingY) low = time;
      else high = time;
    }
    return flightScale(high, airDrag);
  }

  function velocityToLandAt(targetX, vy) {
    const landingY = floor - Math.max(...outlinePoints.map(point => point.y));
    return (targetX - shuttle.x) / landingScale(shuttle.y, vy, landingY);
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
    if (activeEffect?.id === 'invisible') {
      // A hit shows the shuttle for an instant, and everyone (the CPU too) sees where it is going.
      reveal = revealSeconds;
      if (cpuPrediction) cpuPrediction = { x: shuttle.x, y: shuttle.y + cpuSightBias, vx, vy };
    }
  }

  function playerHit(side, swingX, swingY) {
    if (side === 'left') {
      cpuFollowUps = 0;
      cpuOutFeint = undefined;
    }
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
    // Start at the same contact pose the striker saw, then catch up to the server clock.
    Object.assign(shuttle, { x: frame.x, y: frame.y, angle: frame.angle });
    playerHit(side, to.vx, to.vy);
    if (Number.isFinite(frame.time)) {
      strike = { flight, time: frame.time, fromFlight: frame.flight, side,
        racket: { x: to.x, y: to.y },
        pose: { ...shuttlePose(), baseSize: shuttle.size }, motion: { vx: to.vx, vy: to.vy },
        force: pastForce(currentForce(), frame.age ?? 0) };
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

  // The same force as it was `age` seconds ago, when the contact actually happened.
  function pastForce(force, age) {
    return force && { ...force, elapsed: Math.max(0, force.elapsed - age) };
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

  // canHit is off while the shuttle is frozen: the CPU may walk to it but cannot strike it.
  function moveCpu(dt, canHit = true) {
    cpuThaw = Math.max(0, cpuThaw - dt);
    const tracked = cpuPrediction ?? shuttle;
    const defending = tracked.x >= center && tracked.vy > 0;
    const anticipates = cpuLevel === 5 && lastHitter === 'left' && tracked.vy > 0;
    const lead = anticipates ? clamp((floor - tracked.y) / tracked.vy, 0, 0.14) : 0;
    const projectedX = tracked.x + tracked.vx * flightScale(lead, shuttle.airDrag);
    const preparing = anticipates && tracked.vx > 0 && projectedX >= center;
    const { speed, spikeChance, outChance, outMargin, liftChance, doubleLiftChance = 0 } = cpuLevels[cpuLevel - 1];
    let leavingOut = false;
    if (outMargin !== undefined && lastHitter === 'left' && tracked.vx > 0 && tracked.vy > 0) {
      // Even the earliest possible floor contact must land past the line.
      const radius = Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y)));
      const landingX = tracked.x + tracked.vx * landingScale(tracked.y, tracked.vy, floor - radius);
      leavingOut = landingX > rightLine + outMargin;
    }
    const tracking = defending || preparing;
    const chaseX = clamp(defending ? tracked.x : projectedX, center + racketRadius, rightLine - 24);
    const chaseY = clamp(tracked.y + 24, 205, floor - 14);
    let targetX = tracking && !leavingOut ? chaseX : 660;
    let targetY = tracking && !leavingOut ? chaseY : 300;
    if (leavingOut && tracking && !cpuOutFeint) {
      // Commit to a small first step, then hesitate before backing off.
      cpuOutFeint = {
        x: cpu.x + clamp(chaseX - cpu.x, -22, 22),
        y: cpu.y + clamp(chaseY - cpu.y, -14, 14),
        remaining: 0.12
      };
    }
    if (cpuOutFeint?.remaining > 0) {
      cpuOutFeint.remaining = Math.max(0, cpuOutFeint.remaining - dt);
      if (leavingOut) {
        targetX = cpuOutFeint.x;
        targetY = cpuOutFeint.y;
      }
    }
    const travel = speed * dt;
    cpu.x += clamp(targetX - cpu.x, -290 * travel, 290 * travel);
    cpu.y += clamp(targetY - cpu.y, -340 * travel, 340 * travel);
    const inReach = defending && tracked.x <= rightLine && shuttle.x <= rightLine;
    if (canHit && cpuThaw <= 0 && (inReach || leavingOut) && shuttle.x >= center &&
        (lastHitter !== 'right' || cpuFollowUps > 0) && hitCooldown <= 0 &&
        racketContact(cpu, cpu)) {
      if (leavingOut) {
        // The CPU tried to leave it, but the racket was still in the way.
        const vy = -485;
        launch(velocityToLandAt(245, vy), vy, 'right');
        return;
      }
      const followUp = cpuFollowUps > 0;
      if (followUp) {
        cpuFollowUps--;
      } else if (liftChance && lastHitter === 'left' && !cpuPrediction) {
        const roll = Math.random();
        if (roll < liftChance) cpuFollowUps = roll < doubleLiftChance ? 2 : 1;
      }
      if (cpuFollowUps > 0) {
        // Keep the setup on our side and chase it for the next real contact.
        const target = clamp(shuttle.x, center + 78, rightLine - 75);
        launch(clamp((target - shuttle.x) * 2, -130, 130), -380, 'right');
        return;
      }
      if ((lastHitter === 'left' || followUp) && shuttle.y <= matchNetTop - 65 &&
          Math.random() < (followUp ? Math.max(0.75, spikeChance) : spikeChance)) {
        const target = 205 + Math.random() * 120;
        const vy = 110;
        const vx = velocityToLandAt(target, vy);
        // Budget for the rotating outline until it has fully cleared the net.
        const radius = Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y)));
        const netFraction = (shuttle.x - center + radius + 2) / (shuttle.x - target);
        const clearanceY = shuttle.y + (floor - shuttle.y) * netFraction + radius;
        if (clearanceY < matchNetTop && Math.abs(vx) <= 1050) {
          launch(vx, vy, 'right');
          return;
        }
      }
      const vy = -485 - Math.random() * 45;
      const target = outChance && Math.random() < outChance
        ? leftLine - 16 - Math.random() * 20
        : 160 + Math.random() * 165;
      launch(velocityToLandAt(target, vy), vy, 'right');
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
    const push = forceAt(currentForce());
    advanceFlight(shuttle, dt, scale, drag, gravity * push.gravity / airDrag + push.y, push.x);
    if (cpuPrediction) {
      advanceFlight(cpuPrediction, dt, scale, drag, terminalVelocity);
      // The shadow tells the CPU exactly where the shuttle is sideways; only the height is a guess.
      cpuPrediction.x = shuttle.x;
      cpuPrediction.vx = shuttle.vx;
    }
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
    if (netReturn) {
      netReturn.elapsed = Math.min(netMoveSeconds, netReturn.elapsed + dt);
      const progress = netReturn.elapsed / netMoveSeconds;
      const eased = progress * progress * (3 - 2 * progress);
      matchNetTop = netReturn.from + (baseNetTop - netReturn.from) * eased;
      netStart.y = matchNetTop;
      if (netReturn.elapsed >= netMoveSeconds - 1e-9) {
        matchNetTop = baseNetTop;
        netStart.y = matchNetTop;
        netReturn = undefined;
      }
    }
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

    reveal = Math.max(0, reveal - dt);
    updateEvent(dt);
    if (activeEffect?.id === 'freeze') {
      // Only the shuttle is frozen: players keep moving, but nothing can be hit until it thaws.
      if (withCpu) moveCpu(dt, false);
      return;
    }
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
        const motion = contactMotion(racket, racket.time + racket.age * 1000);
        checkContact(side, racket, racket, motion.vx, motion.vy);
      }
      moveCpu(dt);
    }
  }

  function view() {
    const frozen = activeEffect?.id === 'freeze';
    const invisible = activeEffect?.id === 'invisible';
    const visible = shuttle && phase !== 'starting' && (!invisible || reveal > 0);
    const position = (racket) => racket && { x: racket.x, y: racket.y, seenTime: racket.seenTime };
    return {
      phase, score, message, winner, eventText, eventWind, flash, frozen, support, cpuLevel, netTop: matchNetTop,
      strike: strike?.flight === flight ? strike : undefined,
      force: currentForce(),
      // INVISIBLE: where the shuttle's shadow falls on the floor line; near is 0 (high up) to 1 (at the floor).
      shadow: invisible && shuttle && phase === 'live' ? { x: shuttle.x, near: clamp(shuttle.y / floor, 0, 1) } : undefined,
      shake: activeEffect?.id === 'shock' ? activeEffect.remaining : 0,
      shuttle: visible ? { ...shuttlePose(), flight, baseSize: shuttle.size, canHit: hitCooldown <= 0 && !pendingLanding && !frozen } : undefined,
      left: position(rackets.left),
      right: position(cpu ?? rackets.right)
    };
  }

  // For trying effects out (?test=effects): start one right now if a rally is live.
  function triggerEffect(id) {
    const effect = effects.find(candidate => candidate.id === id);
    if (!effect || phase !== 'live' || activeEffect || !shuttle || pendingLanding) return false;
    countdown = 0;
    startEffect(effect);
    return true;
  }

  // Test page only: which shape and size tier the next serves use. Anything else means random.
  function setShuttle({ shape: wantedShape, size: wantedSize } = {}) {
    shuttleChoice.shape = Number.isInteger(wantedShape) && wantedShape >= 0 && wantedShape < shapes.length ? wantedShape : undefined;
    shuttleChoice.size = Number.isInteger(wantedSize) && wantedSize >= 0 && wantedSize < shuttleSizes.length ? wantedSize : undefined;
  }

  function setEffects(on) {
    effectsOn = Boolean(on);
  }

  // Test page only: make an effect last this many seconds (nothing or nonsense restores its usual time).
  function setEffectSeconds(id, seconds) {
    if (!effects.some(effect => effect.id === id)) return;
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 10) effectSeconds[id] = seconds;
    else delete effectSeconds[id];
  }

  // Test page only: pick the next HIGH NET / LOW NET size.
  function setNetScale(id, scale) {
    if (id in netScales && Number.isFinite(scale) && scale > 0 && scale < 4) netScales[id] = scale;
  }

  return { restart, moveRacket, holdRacket, contactFrame, simulate, view, triggerEffect, setNetScale, setEffectSeconds, setShuttle, setEffects };
}
