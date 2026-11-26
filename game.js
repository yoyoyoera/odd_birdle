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
// NET CORD: the net is hit where it is drawn. The tape is the bar across the top (18 wide, 4 deep); the post is the
// thin upright under it. A shuttle whose first touch is the tape is slowed and popped up instead of ending the rally, as
// in real badminton: it plays on if it falls over, and it is the hitter's point lost if it drops back on their own side.
// A first touch on the post is still 'Net'.
export const tapeHalfWidth = 9;
export const tapeDepth = 4;
// Kept for the test page: how far below the tape top a shot aims, at most.
export const netCordBand = 12;
const netCordLimit = 4;

// Which part of the net (top at `top`) an outline at x, y touches: 'tape', 'post' or undefined. The tape is checked
// first, so a shuttle that meets both at once is on the tape.
export function netPart(top, x, y, rings) {
  const half = tapeDepth / 2;
  if (outlineContact({ x: center - tapeHalfWidth + half, y: top + half }, { x: center + tapeHalfWidth - half, y: top + half }, half, x, y, rings)) {
    return 'tape';
  }
  if (outlineContact({ x: center, y: top + tapeDepth }, netEnd, 2, x, y, rings)) return 'post';
  return undefined;
}

// The first place between two positions where an outline meets the net, checked every few units along the way so a
// fast shuttle cannot skip the thin tape: { part, x, y } or undefined.
export function firstNetTouch(top, fromX, fromY, toX, toY, rings, reach) {
  if (Math.min(fromX, toX) - reach > center + tapeHalfWidth || Math.max(fromX, toX) + reach < center - tapeHalfWidth) return undefined;
  if (Math.max(fromY, toY) + reach < top) return undefined;
  const steps = clamp(Math.ceil(Math.hypot(toX - fromX, toY - fromY) / 2), 1, 40);
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (toX - fromX) * i / steps;
    const y = fromY + (toY - fromY) * i / steps;
    const part = netPart(top, x, y, rings);
    if (part) return { part, x, y };
  }
  return undefined;
}
const netCordSeconds = 0.35;
export const leftLine = 64;
export const rightLine = width - leftLine;
export const racketRadius = 22;
// The racket's radius (every racket is the same size today; a racket could carry its own `r`).
export const radiusOf = racket => racket?.r ?? racketRadius;
const baseGravity = 760;
export const step = 1 / 120;
export const threeTouchLimit = 3;
export const touchLimitReason = 'touch limit';
export const touchLimitFault = 'THAT’S FOUR!';
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
// The newer effects. They are in the random pool (see livePool below) like the older ones.
const trialEffects = [
  { id: 'bumper', label: 'BUMPER', duration: [4, 5] },
  { id: 'decoy', label: 'DECOY', duration: 3 },
  { id: 'trampoline', label: 'TRAMPOLINE', duration: [5, 6] }
];
export const trialEffectIds = trialEffects.map(effect => effect.id);
export const trialEffectLabels = trialEffects.map(effect => effect.label);
const bombEffect = { id: 'bomb', label: 'BOMB' };
const everyEffect = [...effects, ...trialEffects, bombEffect];
// FREEZE and INVISIBLE are retired from play: still here for the test pages (asked for by name), never drawn at random.
const retiredEffects = ['freeze', 'invisible'];
const livePool = everyEffect.filter(effect => effect !== bombEffect && !retiredEffects.includes(effect.id));
const bombPool = [...livePool, bombEffect];
export const retiredEffectIds = [...retiredEffects];
export const randomEffectIds = livePool.map(effect => effect.id);

// BUMPER: a round, fixed post above the middle of the court that the shuttle bounces off.
export const bumperSpot = { x: width / 2, y: 150, r: 34 };
const bumperGrow = 0.3;
const bumperRingSeconds = 0.22;
const bumperMinSpeed = 420;
// DECOY: the shuttle splits into the real one and two fakes that veer off up and down.
const decoyTilt = 0.52;
const decoyPopSeconds = 0.45;
// TRAMPOLINE: both halves of the floor swell into domes; the first landing is thrown back up.
export const trampolineRise = 24;
export const trampolineDentDepth = 18;
export const trampolineHoldSeconds = 0.09;
const trampolineGrow = 0.4;

// How far the net rises or sinks, as a multiple of its height. The test page can change these.
export const defaultNetScales = { highNet: 2, lowNet: 0.3 };

// INVISIBLE: how long the shuttle shows itself after a hit, and how far off the CPU's idea of its
// height can be. The CPU sees what a player sees (where the crowd is looking, and the shuttle for an
// instant at each hit), so it has to guess the height; the weaker the CPU, the bigger the guess is off.
// The shuttle is not flashed on and off: it eases in for a moment and fades back out over this long.
const revealSeconds = 0.3;
const revealPeak = 0.75;
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
const smooth = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// How high the swollen floor stands at x (0 off the court and at the net). `swell` runs 0..1.
export function trampolineLift(x, swell) {
  const [from, to] = x < center ? [leftLine, center - 8] : [center + 8, rightLine];
  if (x <= from || x >= to) return 0;
  return trampolineRise * swell * Math.sin(Math.PI * (x - from) / (to - from)) ** 0.7;
}

// How far the floor is pressed down (negative: sprung back above rest) `age` seconds after the shuttle lands.
export function trampolineDent(age) {
  if (age < 0) return 0;
  if (age < trampolineHoldSeconds) return trampolineDentDepth * smooth(age / trampolineHoldSeconds);
  const t = age - trampolineHoldSeconds;
  return trampolineDentDepth * Math.exp(-9 * t) * Math.cos(26 * t);
}

export function netEffectTop(baseTop, elapsed, scale) {
  const progress = clamp(Math.min(elapsed / netMoveSeconds, (netEffectSeconds - elapsed) / netMoveSeconds), 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  const target = floor - (floor - baseTop) * scale;
  return baseTop + (target - baseTop) * eased;
}

// A CPU match can be played on a mirrored court (the screen is flipped left to right). The shapes are then built back to
// front inside the game itself, so after the flip they read the right way round on screen (the studiyo { y o } shapes
// were showing backwards) and the part of the shuttle you see is the part that hits: one outline for drawing and contact.
let mirroredShapes = false;
export function setMirroredShapes(value) { mirroredShapes = !!value; }

export function shuttleOutline({ shape, size, angle }) {
  const kind = shapes[shape];
  const scale = size * kind.vertexScale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const handed = mirroredShapes ? -1 : 1;
  return kind.rings.map(ring => ring.map(([vx, y]) => {
    const x = vx * handed;
    return {
      x: (x * cos - y * sin) * scale,
      y: (x * sin + y * cos) * scale
    };
  }));
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

function flightProfile(kind, size, gravityScale = 1) {
  const sizeOffset = (size - 21) / 13;
  return { gravity: baseGravity * kind.fall * gravityScale, airDrag: kind.drag * (1 + sizeOffset * 0.16) };
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
  return outlineContact(from, to, radiusOf(to), shuttle.x, shuttle.y, shuttleOutline(shuttle));
}

// How far back an online contact check looks along the shuttle's path (ms): about three frames, and never further back
// than the racket's previous check, so a racket that has just arrived is not met by a shuttle that had already gone.
export const sweepMs = 60;
// Between two checks a fast smash can move further than the racket is wide (2000 units/s is 33 units a frame), so the
// racket and the shuttle are both moved along their paths in small steps and the first step where they meet counts.
// `path` is the shuttle's poses, oldest first, ending with the pose now; the racket goes from `from` to `to` over the same
// time. Returns the index of the first pose that touches, or -1.
export function sweptTouch(path, from, to) {
  const last = path.length - 1;
  for (let i = 0; i <= last; i++) {
    const pose = path[i];
    const k = last === 0 ? 1 : i / last;
    const before = last === 0 ? from : lerpPoint(from, to, Math.max(0, i - 1) / last);
    const at = lerpPoint(from, to, k);
    if (outlineContact(before, at, radiusOf(to), pose.x, pose.y, pose.rings ?? shuttleOutline(pose))) return i;
  }
  return -1;
}

const lerpPoint = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// The shuttle's poses from a to b (same shape and turn), every few units, for sweptTouch.
export function posesBetween(a, b, spacing = 4) {
  const count = clamp(Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing), 1, 60);
  return Array.from({ length: count + 1 }, (_, i) => ({ ...b, ...lerpPoint(a, b, i / count), fraction: i / count }));
}

export function supportedShuttleY(pose, from, to) {
  if (pose.y > from.y || to.y > from.y) return undefined;
  const rings = shuttleOutline(pose);
  const overlapsAt = y => outlineContact(to, to, radiusOf(to), pose.x, y, rings);
  if (!overlapsAt(pose.y)) return undefined;

  // Move only as far up as needed for the racket and outline to separate.
  let low = pose.y - pose.size * 2 - radiusOf(to) * 2;
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
  const { gravity, airDrag } = flightProfile(shapes[pose.shape], pose.baseSize, pose.gravityScale);
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

export function createGame({ withCpu = false, twoPlayers = false, quickEvents = false, bombEffects = false, touchLimit: initialTouchLimit, rules: initialRules, externallyDrivenCpu = false } = {}) {
  // Rules belong to a match; test-page overrides and ordinary random matches keep their old defaults.
  let rules = initialRules ? { ...initialRules } : undefined;
  let permanentAge = 0;
  let swayAge = 0;
  let shrinkFrom;
  const hasPermanentBumper = () => rules?.permanent === 'bumper';
  const hasBumper = () => hasPermanentBumper() || activeEffect?.id === 'bumper';
  // A wind or a balloon that never lets up: it is an effect that does not run out and is put back after every point.
  // The wind blows one way for the whole match (left or right, chosen when the match starts) at a fraction of a gust.
  let permanentWindX = 1;
  const permanentForceKind = () => rules?.permanent === 'wind' || rules?.permanent === 'balloon' ? rules.permanent : undefined;
  function applyPermanentForce() {
    const kind = permanentForceKind();
    if (!kind || activeEffect) return;
    const length = 1e9;
    const force = kind === 'wind'
      ? { type: 'wind', x: permanentWindX * 560 * (Number.isFinite(rules.windScale) ? rules.windScale : 0.5), y: 0, duration: length }
      : { type: 'balloon', duration: length };
    activeEffect = { id: kind, remaining: length, total: length, force };
  }
  const gravityScale = () => Number.isFinite(rules?.gravityScale) && rules.gravityScale > 0 ? rules.gravityScale : 1;
  const effectRate = () => Number.isFinite(rules?.effectRate) && rules.effectRate > 0 ? rules.effectRate : 1;
  const stageQuickEvents = () => Boolean(rules?.quickEvents);
  const stageEffectPool = () => livePool.filter(effect =>
    rules?.effects !== 'none' && (!Array.isArray(rules?.effects) || rules.effects.includes(effect.id)) &&
    !(hasPermanentBumper() && effect.id === 'bumper'));
  // Played on this device (against the CPU, or by two people on one screen): contact is judged here, as the shuttle is,
  // not from what a remote player saw (the online way).
  const local = withCpu || twoPlayers;
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
  let bombFuse;
  let bombFuseDuration;
  let bombBurst;
  let outline;
  let outlinePoints;
  const rackets = {};
  const touching = {};
  let cpu;
  let doubles;
  let turn;
  let lastPlayer;
  let fault;
  const bots = {};
  let cpuLevel;
  let cpuEase = 0;
  let server;
  // Doubles serving: who serves for each team. The same player keeps serving while their team keeps scoring; each time a team
  // wins the serve back, its other player serves.
  let teamServer = { left: 'left', right: 'right' };
  let lastHitter;
  let consecutiveTouches = 0;
  let touchLimit = initialTouchLimit;
  let phase = 'ready';
  let phaseTime;
  let hitCooldown;
  let flash;
  let eventWait;
  let countdown;
  let activeEffect;
  let stoppedBomb;
  let cpuPrediction;
  let cpuFollowUps = 0;
  let cpuThaw = 0;
  let reveal = 0;
  let revealAge = 0;
  let cpuSightBias = 0;
  // Test page only: how long an effect lasts (seconds), instead of its usual time.
  const effectSeconds = {};
  const netScales = { ...defaultNetScales };
  // Test page only: pin the shuttle shape / size tier (undefined = random) and switch effects on or off.
  const shuttleChoice = { shape: undefined, size: undefined };
  let effectsOn = true;
  let onlyEffect;
  let flight = 0;
  let strike;
  let support;
  let pendingLanding;
  let settledSize;
  // Trial effects.
  let decoys = [];
  let pops = [];
  let bumperFlash = 0;
  let bumperCooldown = 0;
  let trampolineHold;
  let press;
  // True from a bounce off the post or the swollen floor until the next hit: the shuttle is a fresh chance for
  // whoever it comes to, even the side that hit it last (the CPU may then hit it twice in a row).
  let afterBounce = false;
  // NET CORD: tape touches in this flight (reset at each hit and serve), how many in the match (for sounds), the last one.
  let cordTouches = 0;
  let cordCount = 0;
  let cordFlash = 0;
  let cordX = center;

  const opponent = (side) => side === 'left' ? 'right' : 'left';
  const teamOf = key => key === 'leftB' ? 'left' : key === 'rightB' ? 'right' : key;
  const cpuLevelOr = (level, fallback) => Number.isInteger(level) && level >= 1 && level <= cpuLevels.length ? level : fallback;
  const otherPlayer = (key, team) => key === team ? team + 'B' : team;

  function resetDoubles() {
    // The serving team starts with its server; the receiving team starts with its first player.
    turn = { left: server === 'left' ? teamServer.left : 'left', right: server === 'right' ? teamServer.right : 'right' };
    lastPlayer = undefined;
    bots.leftB = { x: 112, y: 280, level: doubles.partner };
    bots.right = { x: 660, y: 300, level: doubles.opponents[0] };
    bots.rightB = { x: 790, y: 280, level: doubles.opponents[1] };
    // A bot that serves starts beside the spot the shuttle drops on.
    if (turn.left === 'leftB') bots.leftB.x = 190;
    if (turn.right === 'rightB') bots.rightB.x = 705;
    for (const key of ['left', 'leftB', 'right', 'rightB']) touching[key] = false;
  }

  let pointReason;
  function serve() {
    bombBurst = stoppedBomb = undefined;
    pointReason = undefined;
    settledSize = undefined;
    shrinkFrom = undefined;
    trampolineHold = undefined;
    afterBounce = false;
    cpuFollowUps = 0;
    flight++;
    pendingLanding = undefined;
    support = undefined;
    strike = undefined;
    showEvent('');
    const fixedShape = Number.isInteger(rules?.shuttleShape) && rules.shuttleShape >= 0 && rules.shuttleShape < shapeCount
      ? rules.shuttleShape : shuttleChoice.shape;
    const fixedSize = Number.isInteger(rules?.shuttleSize) && rules.shuttleSize >= 0 && rules.shuttleSize < shuttleSizes.length
      ? rules.shuttleSize : shuttleChoice.size;
    shape = fixedShape ?? (shape < 0
      ? Math.floor(Math.random() * shapes.length)
      : (shape + 1 + Math.floor(Math.random() * (shapes.length - 1))) % shapes.length);
    const x = server === 'left' ? 245 : externallyDrivenCpu ? width - 245 : 660;
    sizeTier = fixedSize ?? (sizeTier < 0
      ? Math.floor(Math.random() * shuttleSizes.length)
      : (sizeTier + 1 + Math.floor(Math.random() * (shuttleSizes.length - 1))) % shuttleSizes.length);
    const size = shuttleSizes[sizeTier];
    shuttle = { x, y: 56, vx: 0, vy: 35, angle: 0, spin: 0.8, size, ...flightProfile(shapes[shape], size, gravityScale()) };
    bombFuseDuration = rules?.bomb ? 3 + Math.floor(Math.random() * 5) : undefined;
    bombFuse = bombFuseDuration;
    bombBurst = undefined;
    updateOutline();
    fault = undefined;
    cpu = withCpu && !doubles ? { x: 660, y: 300 } : undefined;
    if (doubles) resetDoubles();
    phase = 'live';
    lastHitter = undefined;
    consecutiveTouches = 0;
    cordTouches = 0;
    hitCooldown = 0;
    touching.left = touching.right = false;
    flash = 0;
    message = server + ' serve';
  }

  function restart(openingCountdown = 0, selectedCpuLevel, nextRules, options = {}) {
    // Passing a third argument (including undefined/null) explicitly returns practice to its defaults.
    if (arguments.length >= 3) rules = nextRules ? { ...nextRules } : undefined;
    touchLimit = options.touchLimit ?? initialTouchLimit;
    permanentAge = 0;
    swayAge = 0;
    if (rules?.permanent === 'wind') permanentWindX = Math.random() < 0.5 ? -1 : 1;
    bumperCooldown = 0;
    bumperFlash = 0;
    netReturn = undefined;
    winner = undefined;
    score = { left: 0, right: 0 };
    cordFlash = 0;
    pointsToWin = Number.isInteger(rules?.points) && rules.points > 0 ? rules.points : 5 + Math.floor(Math.random() * 11);
    for (const side of ['left', 'right']) {
      const initial = rules?.startScore?.[side];
      if (Number.isInteger(initial) && initial >= 0) score[side] = Math.min(initial, pointsToWin - 1);
    }
    const fixedNetScale = rules?.netScale === 'high' ? 1.4 : rules?.netScale === 'low' ? 0.65 : rules?.netScale;
    const scale = Number.isFinite(fixedNetScale) && fixedNetScale > 0 && fixedNetScale < 4
      ? fixedNetScale : [1, 1.2, 1.4][Math.floor(Math.random() * 3)];
    matchNetTop = Math.round(floor - (floor - netTop) * scale);
    baseNetTop = matchNetTop;
    netStart.y = matchNetTop;
    // A stage can make its CPU clumsier than its level (0 = as the level, 1 = much easier): slower, less sure where the shuttle is.
    cpuEase = Number.isFinite(rules?.cpuEase) ? clamp(rules.cpuEase, 0, 1) : 0;
    const wantedCpuLevel = rules?.cpuLevel ?? selectedCpuLevel;
    if (withCpu) cpuLevel = Number.isInteger(wantedCpuLevel) && wantedCpuLevel >= 1 && wantedCpuLevel <= 5
      ? wantedCpuLevel : 1 + Math.floor(Math.random() * cpuLevels.length);
    const config = withCpu && rules?.doubles;
    const levels = Array.isArray(config?.opponents) ? config.opponents : [config?.opponents, config?.opponents];
    doubles = config ? {
      partner: cpuLevelOr(config.partner, cpuLevel),
      opponents: [cpuLevelOr(levels[0], cpuLevel), cpuLevelOr(levels[1], cpuLevel)]
    } : undefined;
    if (doubles) cpuLevel = Math.max(...doubles.opponents);
    rackets.left = rackets.right = undefined;
    // Who serves first: asked for by the caller (two players on one device take turns), by a twin-shuttle round, or the left.
    server = options.openingSide === 'left' || options.openingSide === 'right' ? options.openingSide
      : externallyDrivenCpu && rules?.openingSide === 'right' ? 'right' : 'left';
    teamServer = { left: 'left', right: 'right' };
    pops = [];
    press = undefined;
    clearEffect();
    scheduleEvent();
    serve();
    if (openingCountdown > 0) {
      phase = 'starting';
      phaseTime = openingCountdown;
      showEvent(String(openingCountdown));
    }
  }

  function finishPoint(side, reason, faultPlayer) {
    if (reason === 'out' && activeEffect?.id === 'bomb') stoppedBomb = bombView(false);
    pointReason = reason;
    fault = faultPlayer;
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
    if (reason === touchLimitReason) showEvent(touchLimitFault);
    // A wrong-turn hit is called out for either team: FOUL for you and your partner, THEIR FOUL for the rivals.
    if (reason === 'wrong partner') showEvent(faultPlayer?.startsWith('left') ? 'FOUL' : 'THEIR FOUL');
    const matchPoint = Math.max(score.left, score.right) === pointsToWin - 1;
    if (!matchPoint && (reason === 'own court' || reason === 'Net')) {
      showEvent(faultReactions[Math.floor(Math.random() * faultReactions.length)]);
    }
    if (!matchPoint && reason === 'missed serve') showEvent('Sleepy?');
    score[side]++;
    if (doubles && server !== side) teamServer[side] = otherPlayer(teamServer[side], side);
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

  function bombView(lit) {
    const { remaining: fuse, total } = activeEffect;
    return { fuse, lit, remaining: fuse / total, secondsLeft: Math.ceil(fuse - 1e-9) };
  }

  function explodeBomb() {
    bombBurst = { x: shuttle.x, y: shuttle.y, age: 0 };
    bombFuse = undefined;
    finishPoint(shuttle.x < center ? 'right' : 'left', 'Explosion');
    showEvent('BOOM!');
  }

  function scheduleEvent() {
    countdown = 0;
    // quickEvents is for trying effects out: they come around much sooner.
    eventWait = stageQuickEvents() ? 1 + Math.random()
      : (quickEvents ? 1 + Math.random() * 1.5 : 3 + Math.random() * 4) / effectRate();
  }

  // The active effect as a force description a client can replay (undefined when none pushes the bird).
  function currentForce() {
    if (!activeEffect?.force) return undefined;
    return { ...activeEffect.force, elapsed: activeEffect.total - activeEffect.remaining };
  }

  function clearEffect() {
    for (const decoy of decoys) popDecoy(decoy);
    decoys = [];
    if (!hasPermanentBumper()) bumperFlash = 0;
    if (['freeze', 'balloon', 'wind'].includes(activeEffect?.id)) flight++;
    if (activeEffect?.id === 'freeze') cpuThaw = 0.25;
    activeEffect = undefined;
    reveal = 0;
    matchNetTop = baseNetTop;
    netStart.y = matchNetTop;
    cpuPrediction = undefined;
    showEvent('');
    applyPermanentForce();
  }

  function startEffect(chosen) {
    const pool = rules ? stageEffectPool()
      : onlyEffect ? everyEffect.filter(candidate => candidate.id === onlyEffect) : bombEffects ? bombPool : livePool;
    const effect = chosen ?? pool[Math.floor(Math.random() * pool.length)];
    if (!effect) return;
    const length = effectSeconds[effect.id] ?? (effect === bombEffect ? 3 + Math.floor(Math.random() * 5) : Array.isArray(effect.duration)
      ? effect.duration[0] + Math.random() * (effect.duration[1] - effect.duration[0]) : effect.duration);
    activeEffect = { id: effect.id, remaining: length, total: length, netScale: netScales[effect.id] ?? effect.netScale };
    let label = effect.label;
    switch (activeEffect.id) {
      case 'bomb':
        shape = 1;
        Object.assign(shuttle, flightProfile(shapes[shape], shuttle.size));
        flight++;
        strike = support = undefined;
        updateOutline();
        break;
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
        // The jolt throws the flight off: whoever it falls to may play it, even the side that hit it last.
        afterBounce = true;
        shuttle.vx = 0;
        shuttle.vy = Math.max(0, shuttle.vy) + 135;
        break;
      case 'invisible':
        // The CPU keeps what it last saw and guesses the height from there, a little off.
        cpuSightBias = (Math.random() * 2 - 1) * cpuSightError(cpuLevel ?? 3) * (1 + 1.5 * cpuEase);
        cpuPrediction = { x: shuttle.x, y: shuttle.y + cpuSightBias, vx: shuttle.vx, vy: shuttle.vy };
        reveal = 0;
        flash = 0;
        break;
      case 'bumper':
        bumperFlash = 0;
        bumperCooldown = 0;
        break;
      case 'decoy':
        splitDecoys();
        break;
      case 'trampoline':
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
    // The storm stage changes effects every 1–2 live rally seconds instead of stacking effects or warnings.
    if (stageQuickEvents() && effectsOn && stageEffectPool().length && lastHitter) {
      eventWait -= dt;
      if (eventWait <= 1e-9) {
        clearEffect();
        startEffect();
        return;
      }
    }
    if (activeEffect) {
      activeEffect.remaining -= dt;
      if (activeEffect.netScale !== undefined) {
        matchNetTop = netEffectTop(baseNetTop, netEffectSeconds - activeEffect.remaining, activeEffect.netScale);
        netStart.y = matchNetTop;
      }
      if (activeEffect.id !== 'bomb' && activeEffect.remaining <= 1e-9) clearEffect();
      return;
    }
    if (!effectsOn || (rules && !stageEffectPool().length) || stageQuickEvents()) return;
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
      // The warning is always 3, 2, 1; a stage can drop it so the effect simply happens.
      if (rules?.noCountdown) { startEffect(); return; }
      countdown = 3;
    }
    showEvent(String(Math.ceil(countdown - 1e-9)));
  }

  // --- BUMPER ---
  function bumperSize() {
    if (hasPermanentBumper()) return smooth(Math.min(1, permanentAge / bumperGrow));
    if (activeEffect?.id !== 'bumper') return 0;
    const age = activeEffect.total - activeEffect.remaining;
    return smooth(Math.min(age / bumperGrow, activeEffect.remaining / bumperGrow));
  }

  function bumperBounce() {
    const size = bumperSize();
    if (size < 0.6 || bumperCooldown > 0 || support) return;
    const radius = bumperSpot.r * size;
    if (!outlineContact(bumperSpot, bumperSpot, radius, shuttle.x, shuttle.y, outline)) return;
    let nx = shuttle.x - bumperSpot.x;
    let ny = shuttle.y - bumperSpot.y;
    const length = Math.hypot(nx, ny);
    if (length < 1e-6) { nx = 0; ny = -1; } else { nx /= length; ny /= length; }
    const along = shuttle.vx * nx + shuttle.vy * ny;
    if (along < 0) {
      shuttle.vx -= 2 * along * nx;
      shuttle.vy -= 2 * along * ny;
    }
    const speed = Math.hypot(shuttle.vx, shuttle.vy);
    if (speed < bumperMinSpeed) {
      const k = bumperMinSpeed / Math.max(speed, 1e-6);
      shuttle.vx = speed < 1e-6 ? nx * bumperMinSpeed : shuttle.vx * k;
      shuttle.vy = speed < 1e-6 ? ny * bumperMinSpeed : shuttle.vy * k;
    }
    // Slide out along the normal until the outline no longer overlaps the post.
    for (let i = 0; i < 60 && outlineContact(bumperSpot, bumperSpot, radius, shuttle.x, shuttle.y, outline); i++) {
      shuttle.x += nx * 1.5;
      shuttle.y += ny * 1.5;
    }
    shuttle.spin = shuttle.vx / 92 + 1.4;
    afterBounce = true;
    bumperFlash = bumperRingSeconds;
    bumperCooldown = 0.1;
    flight++;
    strike = undefined;
    updateOutline();
  }

  // --- DECOY ---
  function rotate(vx, vy, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { vx: vx * cos - vy * sin, vy: vx * sin + vy * cos };
  }

  function splitDecoys() {
    let { vx, vy } = shuttle;
    let speed = Math.hypot(vx, vy);
    if (speed < 60) {
      vx = shuttle.x < center ? 1 : -1;
      vy = 0;
      speed = 1;
    }
    const fakeSpeed = Math.max(speed, 300);
    const base = { vx: vx / speed * fakeSpeed, vy: vy / speed * fakeSpeed };
    const a = rotate(base.vx, base.vy, decoyTilt);
    const b = rotate(base.vx, base.vy, -decoyTilt);
    // One flies higher than the real shuttle, one lower.
    const [higher, lower] = a.vy <= b.vy ? [a, b] : [b, a];
    decoys = [higher, lower].map(velocity => ({
      x: shuttle.x, y: shuttle.y, ...velocity, angle: shuttle.angle, spin: shuttle.spin,
      size: shuttlePose().size, gravity: shuttle.gravity, airDrag: shuttle.airDrag
    }));
  }

  function decoyPose(decoy) {
    return { x: decoy.x, y: decoy.y, shape, angle: decoy.angle, size: decoy.size };
  }

  function popDecoy(decoy) {
    pops.push({ x: decoy.x, y: decoy.y, shape, angle: decoy.angle, size: decoy.size, age: 0 });
    decoy.gone = true;
  }

  function advanceDecoys(dt) {
    for (const decoy of decoys) {
      if (decoy.gone) continue;
      const previousX = decoy.x;
      const previousY = decoy.y;
      advanceFlight(decoy, dt, flightScale(dt, decoy.airDrag), Math.exp(-decoy.airDrag * dt), decoy.gravity / decoy.airDrag);
      decoy.angle += decoy.spin * dt;
      const rings = shuttleOutline(decoyPose(decoy));
      const bottom = Math.max(...rings.flat().map(point => point.y));
      const hitsNet = Boolean(firstNetTouch(matchNetTop, previousX, previousY, decoy.x, decoy.y, rings, decoy.size * 2));
      if (decoy.y + bottom >= floor || decoy.x < -40 || decoy.x > width + 40 || hitsNet) popDecoy(decoy);
    }
    decoys = decoys.filter(decoy => !decoy.gone);
  }

  // A racket that touches a fake bursts it.
  function racketPopsDecoys(from, to) {
    for (const decoy of decoys) {
      if (!decoy.gone && outlineContact(from, to, radiusOf(to), decoy.x, decoy.y, shuttleOutline(decoyPose(decoy)))) {
        popDecoy(decoy);
      }
    }
    decoys = decoys.filter(decoy => !decoy.gone);
  }

  // --- TRAMPOLINE ---
  function trampolineSwell() {
    if (activeEffect?.id !== 'trampoline') return 0;
    const age = activeEffect.total - activeEffect.remaining;
    return smooth(Math.min(age / trampolineGrow, activeEffect.remaining / trampolineGrow));
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

  // Where the shuttle goes from `from`, flown forward the way the game will fly it: with the push of a running
  // GUST or BALLOON, held still by FREEZE, thrown back by the TRAMPOLINE floor and the BUMPER post. The CPU uses this
  // to see where a shuttle that has been pushed off its path is really going.
  // How a shuttle that clipped the tape comes off it. `forward` is the way it was crossing; a first touch mostly rolls
  // on over (sometimes it drops back), later ones slide off whichever side it sits on, so it never hangs on the tape.
  // `reach` is the shuttle's size: a big one has further to roll before it drops off, so it comes off faster.
  function cordBounce(body, forward, touches, random, reach) {
    const side = Math.sign(body.x - center) || forward;
    const dir = touches > 1 ? side : random() < 0.72 ? forward : -forward;
    const least = 70 + reach * 2 + (touches > 1 ? 40 : 0);
    body.vx = dir * clamp(Math.abs(body.vx) * 0.3, least, least + 60);
    body.vy = -clamp(Math.abs(body.vy) * 0.12 + 40, 40, 130);
  }

  // A shuttle whose first touch on the net is the tape. From above (its middle higher than the tape) it pops up off it
  // (cordBounce) and is lifted clear; into the end of the tape from the side it comes back off it and drops, as it would
  // off a real net, without being lifted over. Either way it then plays on.
  function cordTouch(body, forward, touches, random, reach, rings) {
    if (body.y < matchNetTop) {
      cordBounce(body, forward, touches, random, reach);
      for (let i = 0; i < 40 && netPart(matchNetTop, body.x, body.y, rings); i++) body.y -= 1;
    } else {
      // Away from the net on the side its middle is on (never pushed through to the other side).
      const away = Math.sign(body.x - center) || -forward;
      body.vx = away * clamp(Math.abs(body.vx) * 0.25, 40, 140);
      body.vy = clamp(body.vy * 0.3, -40, 220);
      for (let i = 0; i < 60 && netPart(matchNetTop, body.x, body.y, rings); i++) body.x += away;
    }
  }

  function flyForward(from, seconds = 3.5, watchPost = false) {
    const dt = 1 / 60;
    const bottom = Math.max(...outlinePoints.map(point => point.y));
    const reach = Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y)));
    const body = { x: from.x, y: from.y, vx: from.vx, vy: from.vy };
    const { gravity, airDrag } = shuttle;
    const force = currentForce();
    const frozenFor = activeEffect?.id === 'freeze' ? activeEffect.remaining : 0;
    const clock = activeEffect ? activeEffect.total - activeEffect.remaining : 0;
    const left = activeEffect ? activeEffect.remaining : 0;
    let floorUsed = activeEffect?.id !== 'trampoline' || Boolean(activeEffect.used);
    let postWait = 0;
    let hitPost = false;
    let netTouches = cordTouches;
    const path = [];
    for (let t = 0; t < seconds; t += dt) {
      if (t < frozenFor) { path.push({ t, x: body.x, y: body.y, vy: 0 }); continue; }
      const push = forceAt(force, t);
      const beforeX = body.x;
      const beforeY = body.y;
      advanceFlight(body, dt, flightScale(dt, airDrag), Math.exp(-airDrag * dt), gravity * push.gravity / airDrag + push.y, push.x);
      // The net, as the game sees it: the tape pops the shuttle up (taking the likely roll over), the post ends it there.
      const touch = lastHitter && firstNetTouch(matchNetTop, beforeX, beforeY, body.x, body.y, outline, reach);
      if (touch) {
        if (touch.part !== 'tape' || netTouches >= netCordLimit) return { path, landing: { t, x: touch.x, y: touch.y, net: true }, hitPost };
        netTouches++;
        body.x = touch.x;
        body.y = touch.y;
        cordTouch(body, Math.sign(body.x - beforeX) || (lastHitter === 'left' ? 1 : -1), netTouches, () => 0, reach, outline);
      }
      postWait -= dt;
      if (hasBumper() && (hasPermanentBumper() || left - t > 0) && postWait <= 0) {
        const size = hasPermanentBumper() ? smooth(Math.min(1, (permanentAge + t) / bumperGrow))
          : smooth(Math.min((clock + t) / bumperGrow, (left - t) / bumperGrow));
        const dx = body.x - bumperSpot.x;
        const dy = body.y - bumperSpot.y;
        const distance = Math.hypot(dx, dy);
        if (size > 0.6 && distance < bumperSpot.r * size + reach * 0.8 && distance > 1e-6) {
          const along = body.vx * dx / distance + body.vy * dy / distance;
          // Planning a shot: just note that it would meet the post. Otherwise bounce off it like the shuttle will.
          if (watchPost) hitPost = true;
          else if (along < 0) { body.vx -= 2 * along * dx / distance; body.vy -= 2 * along * dy / distance; }
          postWait = 0.1;
        }
      }
      if (!floorUsed && left - t > 0) {
        const swell = smooth(Math.min((clock + t) / trampolineGrow, (left - t) / trampolineGrow));
        const lift = trampolineLift(body.x, swell);
        if (lift > 1 && body.y + bottom >= floor - lift) {
          body.vy = -clamp(Math.abs(body.vy) * 0.9 + 160, 560, 1000);
          body.vx *= 0.85;
          floorUsed = true;
          t += trampolineHoldSeconds;
        }
      }
      if (body.y + bottom >= floor) return { path, landing: { t, x: body.x, y: body.y }, hitPost };
      path.push({ t, x: body.x, y: body.y, vy: body.vy });
    }
    return { path, landing: undefined, hitPost };
  }

  const pushed = () => hasPermanentBumper() || Boolean(currentForce()) || ['freeze', 'trampoline', 'bumper'].includes(activeEffect?.id);

  function velocityToLandAt(targetX, vy, watchPost = false) {
    if (!pushed()) {
      const landingY = floor - Math.max(...outlinePoints.map(point => point.y));
      return (targetX - shuttle.x) / landingScale(shuttle.y, vy, landingY);
    }
    // With something pushing the shuttle, find by trial the sideways speed that makes it come down at targetX.
    let low = -1800;
    let high = 1800;
    for (let i = 0; i < 14; i++) {
      const vx = (low + high) / 2;
      const { path, landing } = flyForward({ x: shuttle.x, y: shuttle.y, vx, vy }, 3.5, watchPost);
      const x = landing ? landing.x : path.at(-1)?.x ?? shuttle.x;
      if (x < targetX) low = vx; else high = vx;
    }
    return (low + high) / 2;
  }

  // The CPU's ordinary return: aimed at targetX, and while the BUMPER post is up, with an arc that goes round it.
  function returnShot(targetX, vy) {
    if (!hasBumper()) return { vx: velocityToLandAt(targetX, vy), vy };
    let first;
    for (const option of [vy, -620, -380, -760, -300]) {
      const vx = velocityToLandAt(targetX, option, true);
      first ??= { vx, vy: option };
      if (!flyForward({ x: shuttle.x, y: shuttle.y, vx, vy: option }, 3.5, true).hitPost) return { vx, vy: option };
    }
    return first;
  }

  function touchesLeft(team) {
    return (touchLimit ?? Infinity) - (lastHitter === team ? consecutiveTouches : 0);
  }

  function launch(vx, vy, hitter) {
    const team = teamOf(hitter);
    support = undefined;
    strike = undefined;
    pendingLanding = undefined;
    if (touchesLeft(team) === 0) {
      finishPoint(opponent(team), touchLimitReason);
      return false;
    }
    afterBounce = false;
    flight++;
    shuttle.vx = vx;
    shuttle.vy = vy;
    if (Number.isFinite(rules?.shrink) && rules.shrink > 0 && rules.shrink < 1) {
      // Shrinking Bird: every hit makes the shuttle a little smaller, down to `shrinkTo` (or 40% of its serving size).
      shrinkFrom ??= shuttle.size;
      const floorSize = Number.isFinite(rules.shrinkTo) ? rules.shrinkTo : shrinkFrom * 0.4;
      shuttle.size = Math.max(floorSize, shuttle.size * rules.shrink);
      Object.assign(shuttle, flightProfile(shapes[shape], shuttle.size, gravityScale()));
      updateOutline();
    }
    shuttle.spin = vx / 92 + 1.4;
    consecutiveTouches = lastHitter === team ? consecutiveTouches + 1 : 1;
    lastHitter = team;
    cordTouches = 0;
    if (doubles) {
      lastPlayer = hitter;
      turn[lastHitter] = otherPlayer(hitter, lastHitter);
      touching[hitter] = true;
      // A returning CPU should plan anew for its next turn.
      if (bots[hitter]) bots[hitter].plan = bots[hitter].outFeint = undefined;
    }
    hitCooldown = 0.14;
    flash = 0.22;
    message = 'Rally in progress';
    if (activeEffect?.id === 'invisible') {
      // A hit shows the shuttle for an instant, and everyone (the CPU too) sees where it is going.
      reveal = revealSeconds;
      revealAge = 0;
      if (cpuPrediction) cpuPrediction = { x: shuttle.x, y: shuttle.y + cpuSightBias, vx, vy };
    }
    return true;
  }

  function playerHit(side, swingX, swingY) {
    if (side === 'left') {
      cpuFollowUps = 0;
      if (cpu) cpu.outFeint = undefined;
    }
    const { vx, vy } = swingVelocity(swingX, swingY);
    return launch(vx, vy, side);
  }

  function onSide(side) {
    return (shuttle.x < center ? 'left' : 'right') === side;
  }

  function shuttlePose() {
    return { x: shuttle.x, y: shuttle.y, shape, angle: shuttle.angle,
      ...(gravityScale() !== 1 ? { gravityScale: gravityScale() } : {}),
      size: settledSize ?? shuttle.size * (activeEffect?.id === 'balloon' ? 2 : 1) };
  }

  function networkShuttlePose() {
    return { ...shuttlePose(), baseSize: shuttle.size,
      touchLimitReachedFor: touchesLeft(lastHitter) === 0 ? lastHitter : undefined };
  }

  function updateOutline() {
    outline = shuttleOutline(shuttlePose());
    outlinePoints = outline.flat();
  }

  function racketContact(from, to, radius = radiusOf(to)) {
    return outlineContact(from, to, radius, shuttle.x, shuttle.y, outline);
  }

  // A boss stage can give the CPU a bigger racket (rules.cpuRacketScale, 1 to 3): it is drawn bigger and reaches as far as it looks.
  const cpuRadius = () => racketRadius * (Number.isFinite(rules?.cpuRacketScale) ? clamp(rules.cpuRacketScale, 1, 3) : 1);

  function wrongPartner(key, from, to) {
    const team = teamOf(key);
    if (phase !== 'live' || pendingLanding || trampolineHold || turn[team] === key) return false;
    if (!onSide(team)) {
      touching[key] = false;
      return false;
    }
    const overlap = racketContact(to, to);
    // Judge faults in the same contact window as legal hits. Pointer samples may still
    // sweep over the shuttle as the swing follows through after the turn has changed.
    const faulted = hitCooldown <= 0 && !touching[key] && racketContact(from, to);
    touching[key] = overlap;
    if (faulted) finishPoint(opponent(team), 'wrong partner', key);
    return faulted;
  }

  // `previous`: where the shuttle was at the last check (one game step ago); the path from there is checked too.
  function checkContact(side, from, to, swingX, swingY, previous) {
    if (doubles && turn[side] !== side) {
      wrongPartner(side, from, to);
      return;
    }
    const onCourt = onSide(side);
    const overlap = onCourt && racketContact(to, to);
    const path = previous ? posesBetween(previous, { x: shuttle.x, y: shuttle.y, rings: outline }) : undefined;
    const meet = path ? sweptTouch(path, from, to) : racketContact(from, to) ? 0 : -1;
    if (phase === 'live' && !trampolineHold && onCourt && hitCooldown <= 0 &&
        (!touching[side] || (support === side && isSwing({ vx: swingX, vy: swingY }))) && meet >= 0) {
      // Hit from the point on its path where it first met the racket.
      if (path) {
        shuttle.x = path[meet].x;
        shuttle.y = path[meet].y;
      }
      playerHit(side, swingX, swingY);
      touching[side] = overlap;
    } else if (!overlap) {
      touching[side] = false;
    }
  }

  function contactFrame() {
    if (phase !== 'live' || pendingLanding || trampolineHold || activeEffect?.id === 'freeze') return undefined;
    return { ...shuttlePose(), flight, canHit: hitCooldown <= 0 };
  }

  // `sample(time)`: the shuttle as the server had it at an earlier moment (rooms.js), so the path since the racket's last
  // check (`since`, at most sweepMs back) is swept, not only the pose the player saw last.
  function onlineContact(side, from, to, seen, hold = false, sample, since) {
    if (phase !== 'live' || trampolineHold || activeEffect?.id === 'freeze' || !seen || seen.flight !== flight) return;
    if ((seen.x < center ? 'left' : 'right') !== side) {
      touching[side] = false;
      return;
    }
    const rings = shuttleOutline(seen);
    const overlaps = outlineContact(to, to, racketRadius, seen.x, seen.y, rings);
    if (touching[side] && !(support === side && !hold && isSwing(to))) {
      if (!overlaps) touching[side] = false;
      return;
    }
    const path = [];
    if (sample && Number.isFinite(seen.time)) {
      const start = Math.max(seen.time - sweepMs, Number.isFinite(since) ? since : -Infinity);
      // About every 4 ms (8 units of a 2000 units/s smash), on this flight and this side of the net only.
      const count = Math.min(15, Math.floor((seen.time - start) / 4));
      for (let i = count; i >= 1; i--) {
        const earlier = sample(seen.time - (seen.time - start) * i / count);
        if (earlier?.flight === seen.flight && earlier.canHit && (earlier.x < center ? 'left' : 'right') === side) path.push(earlier);
      }
    }
    path.push(seen);
    const meet = sweptTouch(path, from, to);
    const frame = path[meet];
    if (meet < 0 || !frame.canHit) {
      return;
    }
    // Start at the same contact pose the striker saw, then catch up to the server clock.
    Object.assign(shuttle, { x: frame.x, y: frame.y, angle: frame.angle });
    if (!playerHit(side, to.vx, to.vy)) return;
    if (Number.isFinite(frame.time)) {
      strike = { flight, time: frame.time, fromFlight: frame.flight, side,
        racket: { x: to.x, y: to.y },
        pose: networkShuttlePose(), motion: { vx: to.vx, vy: to.vy },
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

  function holdRacket(side, frame, time, sample) {
    const racket = rackets[side];
    if (racket) {
      const since = racket.seenTime;
      if (Number.isFinite(frame?.time)) racket.seenTime = frame.time;
      onlineContact(side, racket, { ...racket, ...contactMotion(racket, time) }, frame, true, sample, since);
    }
  }

  function supportShuttle(side, from, to) {
    if (phase !== 'live' || pendingLanding || trampolineHold || !onSide(side)) return false;
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

  function moveRacket(side, input, frame, sample) {
    if (doubles && side !== 'left') return;
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
    if (decoys.length) racketPopsDecoys(previous, next);
    if (activeEffect?.id === 'freeze') return;
    Object.assign(next, swingMotion(previous, next));
    if (!doubles && next.vy < 0 && !isSwing(next) && supportShuttle(side, previous, next)) return;
    if (local) checkContact(side, previous, next, next.vx, next.vy);
    else onlineContact(side, previous, next, frame, false, sample, previous === next ? undefined : previous.seenTime);
  }

  // canHit is off while the shuttle is frozen: the CPU may walk to it but cannot strike it.
  // Doubles: a bot that is not chasing hovers higher when the shuttle is high and lower when it is low, so it is already
  // where it will need to be (up for a lob, down for a drop), instead of sliding along one fixed height.
  const idleHeight = (waiting = true) => waiting
    ? clamp(275 + (shuttle.y - 224) * 0.2, 240, 335)
    : clamp(310 + (shuttle.y - 224) * 0.15, 290, 345);

  function moveCpu(dt, canHit, key = 'right', bot = cpu, level = cpuLevel) {
    const team = teamOf(key);
    // Use the same aiming rules from either end of the court.
    const reflect = team === 'left';
    const courtX = x => reflect ? width - x : x;
    const birdX = courtX(shuttle.x);
    const incoming = lastHitter === opponent(team);
    const source = cpuPrediction ?? shuttle;
    const tracked = reflect ? { ...source, x: courtX(source.x), vx: -source.vx } : source;
    // A rising shuttle can be hit too when something threw it up (the floor, the post) or is holding it up.
    const lifted = afterBounce || ['wind', 'balloon'].includes(activeEffect?.id);
    const defending = tracked.x >= center && (tracked.vy > 0 || lifted);
    // Fly the shuttle forward (with whatever is pushing it) to see where it is really going to come to.
    bot.planWait = (bot.planWait ?? 0) - dt;
    if (!cpuPrediction && shuttle && (incoming || afterBounce || (doubles && lastHitter === team))) {
      if (!bot.plan || bot.planWait <= 0 || bot.plan.flight !== flight) {
        const flown = flyForward(shuttle);
        if (reflect) {
          for (const point of flown.path) point.x = courtX(point.x);
          if (flown.landing) flown.landing.x = courtX(flown.landing.x);
        }
        const meets = flown.path.find(point => point.x >= center + racketRadius && point.x <= rightLine && point.vy > 0 && point.y >= 250) ??
          (flown.landing && flown.landing.x >= center && flown.landing.x <= rightLine ? flown.landing : undefined);
        bot.plan = { flight, landing: flown.landing, meets };
        bot.planWait = 0.05;
      }
    } else {
      bot.plan = undefined;
    }
    const aim = level >= 3 && bot.plan?.meets ? bot.plan.meets : undefined;
    const anticipates = level === 5 && incoming && tracked.vy > 0;
    const lead = anticipates ? clamp((floor - tracked.y) / tracked.vy, 0, 0.14) : 0;
    const projectedX = tracked.x + tracked.vx * flightScale(lead, shuttle.airDrag);
    const preparing = anticipates && tracked.vx > 0 && projectedX >= center;
    const levelProfile = cpuLevels[level - 1];
    const { outMargin } = levelProfile;
    // Smash Fest: the CPU sets the shuttle up high, waits under it and smashes (stage rule cpuLift = how often it sets up).
    const settingUp = Number.isFinite(rules?.cpuLift);
    const liftChance = doubles ? 0 : settingUp ? clamp(rules.cpuLift, 0, 1) : levelProfile.liftChance;
    const doubleLiftChance = settingUp ? 0.25 : levelProfile.doubleLiftChance ?? 0;
    // A stage can make its CPU smash far more than its level would (Smash Fest).
    const spikeChance = Number.isFinite(rules?.cpuSpike) ? clamp(rules.cpuSpike, 0, 1) : levelProfile.spikeChance;
    const speed = levelProfile.speed * (1 - 0.4 * cpuEase);
    // In doubles the open spaces are near the lines. Even strong CPUs occasionally overhit these returns.
    const outChance = Math.max(doubles ? 0.065 : 0, (levelProfile.outChance ?? 0) + 0.12 * cpuEase);
    let leavingOut = false;
    if (outMargin !== undefined && incoming && bot.plan?.landing && pushed()) {
      leavingOut = bot.plan.landing.x > rightLine + outMargin;
    } else if (outMargin !== undefined && incoming && tracked.vx > 0 && tracked.vy > 0) {
      // Even the earliest possible floor contact must land past the line.
      const radius = Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y)));
      const landingX = tracked.x + tracked.vx * landingScale(tracked.y, tracked.vy, floor - radius);
      leavingOut = landingX > rightLine + outMargin;
    }
    const tracking = defending || preparing || Boolean(aim);
    const chaseX = clamp(aim ? aim.x : defending ? tracked.x : projectedX, center + racketRadius, rightLine - 24);
    // In doubles a bot goes higher for a high shuttle, to meet it early (it is also where a smash starts from).
    const chaseY = clamp((aim ? aim.y : tracked.y) + 24, doubles ? 150 : 205, floor - 14);
    const baseX = key === 'rightB' ? 728 : 660;
    let targetX = tracking && !leavingOut ? chaseX : baseX;
    let targetY = tracking && !leavingOut ? chaseY : doubles ? idleHeight(false) : 300;
    // After setting the shuttle up, wait for it above the net's height: that is where a smash has to start.
    if (settingUp && cpuFollowUps > 0 && lastHitter === team) {
      targetX = clamp(birdX, center + 40, rightLine - 40);
      targetY = Math.min(shuttle.y + 20, matchNetTop - 80);
    }
    if (leavingOut && tracking && !bot.outFeint) {
      // Commit to a small first step, then hesitate before backing off.
      bot.outFeint = {
        x: courtX(bot.x) + clamp(chaseX - courtX(bot.x), -22, 22),
        y: bot.y + clamp(chaseY - bot.y, -14, 14),
        remaining: 0.12
      };
    }
    if (bot.outFeint?.remaining > 0) {
      bot.outFeint.remaining = Math.max(0, bot.outFeint.remaining - dt);
      if (leavingOut) {
        targetX = bot.outFeint.x;
        targetY = bot.outFeint.y;
      }
    }
    const travel = speed * dt;
    bot.x += clamp(courtX(targetX) - bot.x, -290 * travel, 290 * travel);
    bot.y += clamp(targetY - bot.y, -340 * travel, 340 * travel);
    if (!doubles && bot === cpu) {
      // A bigger boss racket must not sink into the net, the floor or the side wall.
      const extra = cpuRadius() - racketRadius;
      bot.x = courtX(clamp(courtX(bot.x), center + racketRadius + extra, width - extra));
      bot.y = Math.min(bot.y, floor - extra);
    }
    const inReach = defending && tracked.x <= rightLine && birdX <= rightLine;
    const remainingTouches = touchesLeft(team);
    if (canHit && remainingTouches > 0 && cpuThaw <= 0 && (inReach || leavingOut) && birdX >= center &&
        (doubles || lastHitter !== team || cpuFollowUps > 0 || afterBounce) && hitCooldown <= 0 &&
        racketContact(bot, bot, doubles ? racketRadius : cpuRadius())) {
      if (leavingOut) {
        // The CPU tried to leave it, but the racket was still in the way.
        const vy = -485;
        launch(velocityToLandAt(courtX(245), vy), vy, key);
        return;
      }
      const followUp = cpuFollowUps > 0;
      if (followUp) {
        cpuFollowUps--;
      } else if (liftChance && incoming && !cpuPrediction) {
        const roll = Math.random();
        if (roll < liftChance) cpuFollowUps = roll < doubleLiftChance ? 2 : 1;
      }
      cpuFollowUps = Math.min(cpuFollowUps, remainingTouches - 1);
      if (cpuFollowUps > 0) {
        // Keep the setup on our side and chase it for the next real contact.
        const target = clamp(shuttle.x, center + 78, rightLine - 75);
        launch(clamp((target - shuttle.x) * 2, -130, 130), settingUp ? -560 : -380, key);
        return;
      }
      if ((incoming || followUp) && shuttle.y <= matchNetTop - 65 &&
          Math.random() < (followUp ? Math.max(0.75, spikeChance) : spikeChance)) {
        const target = 205 + Math.random() * 120;
        const vy = 110;
        const vx = velocityToLandAt(courtX(target), vy);
        // Budget for the rotating outline until it has fully cleared the net.
        const radius = Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y)));
        const netFraction = (birdX - center + radius + 2) / (birdX - target);
        const clearanceY = shuttle.y + (floor - shuttle.y) * netFraction + radius;
        if (clearanceY < matchNetTop && Math.abs(vx) <= 1050) {
          launch(vx, vy, key);
          return;
        }
      }
      const vy = -485 - Math.random() * 45;
      const target = outChance && Math.random() < outChance
        ? leftLine - 16 - Math.random() * 20
        : doubles ? 100 + Math.random() * 285 : 160 + Math.random() * 165;
      const shot = returnShot(courtX(target), vy);
      launch(shot.vx, shot.vy, key);
    }
  }

  // Off-turn bots retreat into a free lane rather than chasing the same shot.
  function moveWaitingBot(key, bot, dt, canHit) {
    const team = teamOf(key);
    const teammate = team === 'left' ? rackets.left : bots[otherPlayer(key, team)];
    // Roles: the waiting player takes the front (near the net) or the back, whichever the partner who will hit next is not
    // holding, so the two never crowd the same patch. It follows the shuttle's height and drifts a little towards it.
    const lanes = team === 'left' ? [82, 368] : [532, 818];
    const home = teammate && teammate.x < (team === 'left' ? center / 2 : center * 1.5) ? lanes[1] : lanes[0];
    const target = { x: clamp(home - (shuttle.x - home) * 0.06, home - 24, home + 24), y: idleHeight() };
    const before = { x: bot.x, y: bot.y };
    // A rival that is waiting its turn is not perfect at getting out of the way: the weaker the CPU, the later it notices
    // the shuttle, the shorter its margin and the slower its step aside, so a smash aimed at it can catch it, and then it
    // is that team's foul. Your own partner keeps full care.
    const rival = team === 'right';
    const skill = rival ? clamp((bot.level - 1) / 4, 0, 1) : 1;
    const safeDistance = (racketRadius + shuttlePose().size * 1.4 + 46) * (rival ? 0.55 + 0.25 * skill : 1);
    const looming = Math.hypot(shuttle.x - bot.x, shuttle.y - bot.y) < safeDistance;
    bot.alert = looming ? (bot.alert ?? 0) + dt : 0;
    const near = looming && bot.alert >= (rival ? 0.12 - 0.06 * skill : 0);
    if (near) {
      target.x = clamp(bot.x + (bot.x < shuttle.x ? -110 : 110),
        team === 'left' ? racketRadius : center + racketRadius, team === 'left' ? center - racketRadius : width - racketRadius);
      target.y = clamp(bot.y + (bot.y < shuttle.y ? -100 : 100), racketRadius, floor - racketRadius);
    }
    const speed = near ? (rival ? 520 + 200 * skill : 850) : 420;
    bot.x += clamp(target.x - bot.x, -speed * dt, speed * dt);
    bot.y += clamp(target.y - bot.y, -speed * dt, speed * dt);
    if (canHit) wrongPartner(key, before, bot);
  }

  function moveCpus(dt, canHit = true) {
    cpuThaw = Math.max(0, cpuThaw - dt);
    if (!doubles) {
      moveCpu(dt, canHit);
      if (canHit && decoys.length && cpu) racketPopsDecoys(cpu, cpu);
      return;
    }
    for (const [key, bot] of Object.entries(bots)) {
      if (phase !== 'live' || pendingLanding) break;
      if (turn[teamOf(key)] === key) moveCpu(dt, canHit, key, bot, bot.level);
      else moveWaitingBot(key, bot, dt, canHit);
      if (decoys.length) racketPopsDecoys(bot, bot);
    }
  }

  // NET CORD: the shuttle's first touch was the tape. True when it plays on (see tapeHalfWidth).
  function netCord(previousX) {
    if (cordTouches >= netCordLimit || support) return false;
    cordTouches++;
    cordCount++;
    cordFlash = netCordSeconds;
    cordX = shuttle.x;
    const forward = Math.sign(shuttle.x - previousX) || (lastHitter === 'left' ? 1 : -1);
    cordTouch(shuttle, forward, cordTouches, Math.random, Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y))), outline);
    shuttle.spin *= 0.4;
    flight++;
    strike = undefined;
    updateOutline();
    return true;
  }

  // NET CORD: the shuttle's first touch was the tape. True when it plays on (see tapeHalfWidth).
  function netCord(previousX) {
    if (cordTouches >= netCordLimit || support) return false;
    cordTouches++;
    cordCount++;
    cordFlash = netCordSeconds;
    cordX = shuttle.x;
    const forward = Math.sign(shuttle.x - previousX) || (lastHitter === 'left' ? 1 : -1);
    cordTouch(shuttle, forward, cordTouches, Math.random, Math.max(...outlinePoints.map(point => Math.hypot(point.x, point.y))), outline);
    shuttle.spin *= 0.4;
    flight++;
    strike = undefined;
    updateOutline();
    return true;
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
      // The crowd's eyes tell the CPU exactly where the shuttle is sideways; only the height is a guess.
      cpuPrediction.x = shuttle.x;
      cpuPrediction.vx = shuttle.vx;
    }
    shuttle.angle += shuttle.spin * dt;
    updateOutline();
    bumperCooldown = Math.max(0, bumperCooldown - dt);
    bumperFlash = Math.max(0, bumperFlash - dt);
    cordFlash = Math.max(0, cordFlash - dt);
    if (hasBumper()) bumperBounce();
    const left = Math.min(...outlinePoints.map(point => point.x));
    const right = Math.max(...outlinePoints.map(point => point.x));
    const bottom = Math.max(...outlinePoints.map(point => point.y));
    const top = Math.min(...outlinePoints.map(point => point.y));

    const touch = lastHitter && firstNetTouch(matchNetTop, previousX, previousY, shuttle.x, shuttle.y, outline,
      Math.max(-left, right, -top, bottom));
    if (touch) {
      shuttle.x = touch.x;
      shuttle.y = touch.y;
      if (touch.part !== 'tape' || !netCord(previousX)) {
        if (!rules?.bomb) {
          finishPoint(opponent(lastHitter), 'Net');
          return;
        }
        // A bomb stays in play after a net fault. Move it clear of the tape before the next step.
        const side = previousX < center ? -1 : 1;
        const reach = side < 0 ? right : -left;
        shuttle.x = center + side * (tapeHalfWidth + reach + 1);
        shuttle.vx = side * Math.max(35, Math.abs(shuttle.vx) * 0.35);
        afterBounce = true;
      }
    }
    if (lastHitter && (shuttle.x + right < 0 || shuttle.x + left > width)) {
      shuttle.x = clamp(shuttle.x, -left, width - right);
      finishPoint(opponent(lastHitter), 'out');
      return;
    }

    const lift = activeEffect?.id === 'trampoline' && !activeEffect.used ? trampolineLift(shuttle.x, trampolineSwell()) : 0;
    if (lift > 1 && shuttle.y + bottom >= floor - lift) {
      // The swollen floor catches it: sink in for a moment, then throw it back up (not a point).
      shuttle.y = floor - lift - bottom;
      trampolineHold = { age: 0, x: shuttle.x, restY: shuttle.y, vx: shuttle.vx, vy: shuttle.vy };
      press = { x: shuttle.x, age: 0 };
      shuttle.vx = 0;
      shuttle.vy = 0;
      activeEffect.used = true;
      activeEffect.remaining = Math.min(activeEffect.remaining, trampolineGrow);
      flight++;
      strike = undefined;
      return;
    }
    if (shuttle.y + bottom >= floor) {
      shuttle.y = floor - bottom;
      const out = shuttle.x < leftLine || shuttle.x > rightLine;
      if (!out && (rules?.bomb || activeEffect?.id === 'bomb')) {
        explodeBomb();
        return;
      }
      const landingSide = shuttle.x < center ? 'left' : 'right';
      const winner = out ? opponent(lastHitter ?? server) : opponent(landingSide);
      let reason = 'Landed';
      if (out) reason = 'out';
      else if (!lastHitter) reason = 'missed serve';
      // Back on the hitter's own side off the net: say so.
      else if (landingSide === lastHitter) reason = cordTouches ? 'Net' : 'own court';
      if (local) finishPoint(winner, reason);
      else pendingLanding = { winner, reason, remaining: 0.24 };
      return;
    }

  }

  function simulate(dt) {
    if (bombBurst) bombBurst.age += dt;
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
    for (const pop of pops) pop.age += dt;
    pops = pops.filter(pop => pop.age < decoyPopSeconds);
    if (press) {
      press.age += dt;
      if (press.age > 0.7) press = undefined;
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

    permanentAge += dt;
    if (rules?.netSway) {
      // Moving Net: the net slides between a low and a high multiple of its height, over and over (base moves with it, so a
      // point ending never starts the "ease back" of a net effect).
      swayAge += dt;
      const scale = (rules.swayMid ?? 1) + (rules.swayAmp ?? 0.4) * Math.sin(swayAge * 2 * Math.PI / (rules.swayPeriod ?? 9));
      matchNetTop = Math.round(floor - (floor - netTop) * scale);
      baseNetTop = matchNetTop;
      netStart.y = matchNetTop;
    }
    reveal = Math.max(0, reveal - dt);
    revealAge += dt;
    updateEvent(dt);
    if (trampolineHold) {
      trampolineHold.age += dt;
      shuttle.y = trampolineHold.restY + trampolineDent(trampolineHold.age) * 0.7;
      if (trampolineHold.age >= trampolineHoldSeconds - 1e-9) {
        const { vx, vy } = trampolineHold;
        shuttle.y = trampolineHold.restY;
        shuttle.vx = vx * 0.85;
        shuttle.vy = -clamp(Math.abs(vy) * 0.9 + 160, 560, 1000);
        shuttle.spin = shuttle.vx / 92 + 1.4;
        trampolineHold = undefined;
        afterBounce = true;
        flash = 0.22;
        flight++;
        strike = undefined;
      }
      updateOutline();
      if (withCpu) moveCpus(dt, false);
      return;
    }
    if (activeEffect?.id === 'freeze') {
      // Only the shuttle is frozen: players keep moving, but nothing can be hit until it thaws.
      if (withCpu) moveCpus(dt, false);
      return;
    }
    const before = shuttle && { x: shuttle.x, y: shuttle.y };
    const flightBefore = flight;
    advanceShuttle(dt);
    if (phase === 'live' && !pendingLanding && activeEffect?.id === 'bomb' && activeEffect.remaining <= 1e-9) {
      explodeBomb();
      return;
    }
    if (phase === 'live' && bombFuse !== undefined) {
      bombFuse -= dt;
      if (bombFuse <= 1e-9) explodeBomb();
    }
    if (decoys.length) advanceDecoys(dt);
    if (support) {
      const racket = rackets[support];
      if (!racket || !supportShuttle(support, racket, { ...racket, vy: 0 })) {
        if (!racket || !onSide(support) || shuttle.y > racket.y ||
            !outlineContact(racket, racket, radiusOf(racket) + 3, shuttle.x, shuttle.y, outline)) support = undefined;
      }
    }
    if (phase !== 'live' || pendingLanding) return;

    if (local) {
      for (const side of withCpu ? ['left'] : ['left', 'right']) {
        const racket = rackets[side];
        if (!racket) continue;
        racket.age += dt;
        const motion = contactMotion(racket, racket.time + racket.age * 1000);
        // Same flight only: a bounce or a hit in this step moved it somewhere it did not fly to.
        checkContact(side, racket, racket, motion.vx, motion.vy, flightBefore === flight ? before : undefined);
      }
      if (withCpu) {
        if (!externallyDrivenCpu && phase === 'live') moveCpus(dt);
        if (decoys.length && cpu) racketPopsDecoys(cpu, cpu);
      }
    }
  }

  function view() {
    const frozen = activeEffect?.id === 'freeze';
    const invisible = activeEffect?.id === 'invisible';
    const visible = shuttle && phase !== 'starting' && (!invisible || reveal > 0);
    const position = (racket) => racket && { x: racket.x, y: racket.y, seenTime: racket.seenTime, r: racket.r };
    return {
      phase, score, message, winner, eventText, eventWind, flash, frozen, support, cpuLevel, touchLimit, netTop: matchNetTop,
      ...(rules ? { pointsToWin } : {}),
      // The crowd reads the target in every match (the goal label above only shows it for a stage).
      crowdPointsToWin: pointsToWin,
      ...(rules?.bomb ? {
        bomb: bombFuse !== undefined && (phase === 'live' || pointReason === 'out')
          ? { fuse: bombFuse, lit: phase === 'live', remaining: bombFuse / bombFuseDuration,
            secondsLeft: Math.ceil(bombFuse - 1e-9) } : undefined,
        bombBurst: bombBurst?.age < 0.57 ? { ...bombBurst } : undefined
      } : {}),
      strike: strike?.flight === flight ? strike : undefined,
      force: currentForce(),
      // Where the crowd is looking: the shuttle's place, sent all through a rally so it is still there when
      // INVISIBLE hides the shuttle itself.
      gaze: shuttle && phase === 'live' ? { x: shuttle.x, y: shuttle.y } : undefined,
      // DECOY: every shuttle the crowd could be looking at (the real one first), while any fake is still up.
      gazes: decoys.length && shuttle && phase === 'live'
        ? [{ x: shuttle.x, y: shuttle.y }, ...decoys.map(decoy => ({ x: decoy.x, y: decoy.y }))] : undefined,
      effect: activeEffect?.id,
      ...(activeEffect?.id === 'bomb' || stoppedBomb ? { bomb: activeEffect?.id === 'bomb' ? bombView(!pendingLanding) : stoppedBomb } : {}),
      ...(rules?.bomb ? {} : { bombBurst: bombBurst?.age < 0.57 ? { ...bombBurst } : undefined }),
      // How strongly the hidden shuttle shows right now (a soft ghost after a hit), for INVISIBLE only.
      shuttleAlpha: invisible ? revealPeak * Math.min(1, revealAge / 0.05) * (reveal / revealSeconds) ** 1.5 : undefined,
      shake: activeEffect?.id === 'shock' ? activeEffect.remaining : 0,
      bumper: hasBumper()
        ? { x: bumperSpot.x, y: bumperSpot.y, r: bumperSpot.r, size: bumperSize(), ring: bumperFlash / bumperRingSeconds } : undefined,
      decoys: decoys.length ? decoys.map(decoy => ({ ...decoyPose(decoy) })) : undefined,
      pops: pops.length ? pops.map(pop => ({ ...pop, progress: pop.age / decoyPopSeconds })) : undefined,
      trampoline: activeEffect?.id === 'trampoline' || press
        ? { swell: trampolineSwell(), press: press ? { x: press.x, age: press.age } : undefined } : undefined,
      // NET CORD: how many tape clips so far (a new one is a sound and an "ooh") and the tape's wobble.
      cord: { count: cordCount, x: cordX, wobble: cordFlash / netCordSeconds },
      shuttle: visible && !bombBurst ? { ...networkShuttlePose(), flight, baseSize: shuttle.size, canHit: hitCooldown <= 0 && !pendingLanding && !frozen } : undefined,
      left: position(rackets.left),
      right: (racket => racket && (!doubles && cpu && cpuRadius() !== racketRadius ? { ...racket, radius: cpuRadius() } : racket))(position(doubles ? bots.right : cpu ?? rackets.right)),
      ...(doubles ? {
        leftB: position(bots.leftB), rightB: position(bots.rightB),
        turn: turn && { ...turn }, lastPlayer, fault, doubles: {
          partner: doubles.partner, opponents: [...doubles.opponents]
        }
      } : {})
    };
  }

  // For trying effects out (?test=effects): start one right now if a rally is live.
  function triggerEffect(id) {
    if (id === 'bomb' && !bombEffects) return false;
    const effect = everyEffect.find(candidate => candidate.id === id);
    if (!effect || phase !== 'live' || activeEffect || !shuttle || pendingLanding) return false;
    if (rules && !stageEffectPool().some(candidate => candidate.id === id)) return false;
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
    if (!everyEffect.some(effect => effect.id === id)) return;
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 10) effectSeconds[id] = seconds;
    else delete effectSeconds[id];
  }

  // Test page only: random effects are always this one (undefined or an unknown id = any effect).
  function setOnlyEffect(id) {
    if (id === 'bomb' && !bombEffects) return;
    onlyEffect = effectIds.includes(id) || trialEffectIds.includes(id) ? id : undefined;
  }

  // Test page only (?test=netcord): the player's side sends the shuttle at the tape, its lowest point crossing the net
  // `depth` units below the top (default: anywhere from just over to just past the cord band).
  function testNetCord(depth = -4 + Math.random() * (netCordBand + 10)) {
    if (phase !== 'live' || !shuttle || pendingLanding || trampolineHold) return false;
    const bottom = Math.max(...outlinePoints.map(point => point.y));
    const from = { x: center - 150, y: matchNetTop - 140 };
    const target = matchNetTop + depth - bottom;
    const vx = 330;
    const crossing = vy => {
      const body = { x: from.x, y: from.y, vx, vy };
      const { gravity, airDrag } = shuttle;
      for (let t = 0; t < 3 && body.x < center; t += step) {
        advanceFlight(body, step, flightScale(step, airDrag), Math.exp(-airDrag * step), gravity / airDrag);
      }
      return body.y;
    };
    let low = -900;
    let high = 300;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (crossing(mid) < target) low = mid; else high = mid;
    }
    Object.assign(shuttle, from, { vx, vy: (low + high) / 2, spin: 1.2 });
    clearEffect();
    lastHitter = 'left';
    consecutiveTouches = 1;
    cordTouches = 0;
    hitCooldown = 0.14;
    flight++;
    strike = undefined;
    support = undefined;
    updateOutline();
    return true;
  }

  // Tests only: put the shuttle somewhere, flying, as if `hitter` had just hit it.
  function testShot({ x, y, vx, vy, hitter = 'right' }) {
    if (phase !== 'live' || !shuttle) return false;
    Object.assign(shuttle, { x, y, vx, vy });
    clearEffect();
    lastHitter = hitter;
    cordTouches = 0;
    hitCooldown = 0;
    touching.left = touching.right = false;
    flight++;
    strike = undefined;
    support = undefined;
    updateOutline();
    return true;
  }

  // Test page only: pick the next HIGH NET / LOW NET size.
  function setNetScale(id, scale) {
    if (id in netScales && Number.isFinite(scale) && scale > 0 && scale < 4) netScales[id] = scale;
  }

  const drivenCpu = externallyDrivenCpu ? {
    rally: () => ({ phase, winner, shuttle, reason: pointReason }),
    deflectShuttle(trajectory) {
      Object.assign(shuttle, trajectory);
      shuttle.spin = shuttle.vx / 92 + 1.4;
      afterBounce = true;
      flight++;
      strike = undefined;
      support = undefined;
      updateOutline();
    },
    driveCpu(position, dt) {
      if (phase !== 'live') return position;
      Object.assign(cpu, position);
      moveCpus(dt);
      return { x: cpu.x, y: cpu.y };
    }
  } : {};
  return { restart, moveRacket, holdRacket, contactFrame, simulate, view, triggerEffect, testNetCord, testShot, setNetScale, setEffectSeconds, setShuttle, setEffects, setOnlyEffect, ...drivenCpu };
}

// The twin stage uses two round shuttles of equal mass. Sweep their relative motion to find first contact,
// then exchange part of their speed along the line between their centers.
export function twinShuttleContact(first, second, fromFirst, fromSecond) {
  const radius = first.size + second.size;
  const startX = fromSecond.x - fromFirst.x;
  const startY = fromSecond.y - fromFirst.y;
  const endX = second.x - first.x;
  const endY = second.y - first.y;
  const dx = endX - startX;
  const dy = endY - startY;
  const gap = startX * startX + startY * startY - radius * radius;
  let at = 1;
  if (gap >= 0) {
    const approach = startX * dx + startY * dy;
    const travel = dx * dx + dy * dy;
    const discriminant = approach * approach - travel * gap;
    if (approach >= 0 || discriminant < 0) return;
    at = gap / (-approach + Math.sqrt(discriminant));
    if (at > 1) return;
  } else if (Math.hypot(endX, endY) >= radius) {
    return;
  }

  const x = startX + dx * at;
  const y = startY + dy * at;
  const distance = Math.hypot(x, y);
  const nx = distance ? x / distance : 1;
  const ny = distance ? y / distance : 0;
  const closingSpeed = (first.vx - second.vx) * nx + (first.vy - second.vy) * ny;
  const impulse = Math.max(0, closingSpeed) * 0.88;
  const separation = Math.max(0, radius - distance) * 0.5 + 0.001;
  const firstX = fromFirst.x + (first.x - fromFirst.x) * at;
  const firstY = fromFirst.y + (first.y - fromFirst.y) * at;
  return {
    first: { x: firstX - nx * separation, y: firstY - ny * separation,
      vx: first.vx - nx * impulse, vy: first.vy - ny * impulse },
    second: { x: firstX + x + nx * separation, y: firstY + y + ny * separation,
      vx: second.vx + nx * impulse, vy: second.vy + ny * impulse },
    spark: impulse > 0 ? { x: firstX + nx * first.size, y: firstY + ny * first.size, age: 0 } : undefined
  };
}

// Each shuttle keeps its own flight and fault rules. Only their combined result can score a match point.
export function createTwinShuttleGame() {
  const shuttles = ['left', 'right'].map(openingSide => ({
    openingSide, game: createGame({ withCpu: true, externallyDrivenCpu: true })
  }));
  let score, rules, cpuLevel, pointsToWin, cpu, pointer, phase, winner, eventText, betweenTime;
  let matchOptions;
  const shuttleCallSeconds = 2.5;
  let clash;
  let shuttleCalls, firstCallTime, settledShuttle;

  function startRound(openingCountdown = 0) {
    cpu = { x: 660, y: 300 };
    phase = openingCountdown ? 'starting' : 'live';
    eventText = '';
    clash = undefined;
    shuttleCalls = [];
    firstCallTime = 0;
    settledShuttle = undefined;
    for (const { openingSide, game } of shuttles) {
      game.restart(openingCountdown, cpuLevel, {
        ...rules, openingSide, points: 1, shuttleShape: 1, shuttleSize: 1
      }, matchOptions);
      if (pointer) game.moveRacket('left', pointer);
    }
  }

  function restart(openingCountdown, level, stageRules, options) {
    rules = stageRules;
    matchOptions = options;
    cpuLevel = level;
    pointsToWin = stageRules.points;
    score = { left: 0, right: 0 };
    pointer = undefined;
    winner = undefined;
    startRound(openingCountdown);
  }

  function urgency(shuttle) {
    const { x, y, vx, vy } = shuttle;
    const fallTime = (Math.sqrt(vy * vy + 2 * baseGravity * Math.max(0, floor - y)) - vy) / baseGravity;
    const landingX = x + vx * fallTime;
    const penalty = landingX >= center && landingX <= rightLine ? 0 : x >= center ? 1.6 : 3;
    return fallTime + penalty + Math.abs(cpu.x - x) / 1100;
  }

  function simulate(dt) {
    firstCallTime = Math.max(0, firstCallTime - dt);
    if (clash) {
      clash.age += dt;
      if (clash.age >= 0.22) clash = undefined;
    }
    if (phase === 'finished') return;
    if (phase === 'between') {
      betweenTime -= dt;
      if (betweenTime <= 1e-9) startRound();
      return;
    }
    const before = shuttles.map(({ game }) => {
      const { phase, shuttle } = game.rally();
      return phase === 'live' ? { x: shuttle.x, y: shuttle.y } : undefined;
    });
    for (const { game } of shuttles) game.simulate(dt);
    const [first, second] = shuttles.map(({ game }) => game.rally());
    phase = first.phase === 'starting' ? 'starting' : 'live';
    if (phase === 'starting') return;
    for (const [index, rally] of [first, second].entries()) {
      if (!rally.winner || shuttleCalls.some(call => call.index === index)) continue;
      shuttleCalls.push({ index, winner: rally.winner, reason: rally.reason });
      if (shuttleCalls.length === 1) firstCallTime = shuttleCallSeconds;
      else settledShuttle = shuttles[index].game.view().shuttle;
    }
    if (first.winner && second.winner) {
      if (first.winner === second.winner) {
        const side = first.winner;
        score[side]++;
        eventText = side === 'left' ? 'BOTH YOURS' : 'BOTH LOST';
        if (score[side] === pointsToWin) {
          winner = side;
          phase = 'finished';
          return;
        }
      } else {
        eventText = 'SPLIT · REPLAY';
      }
      phase = 'between';
      betweenTime = Math.max(1.1, firstCallTime);
      return;
    }
    if (before[0] && before[1] && first.phase === 'live' && second.phase === 'live') {
      const contact = twinShuttleContact(first.shuttle, second.shuttle, ...before);
      if (contact) {
        shuttles[0].game.deflectShuttle(contact.first);
        shuttles[1].game.deflectShuttle(contact.second);
        if (contact.spark) clash = contact.spark;
      }
    }
    const target = first.winner || (!second.winner && urgency(second.shuttle) < urgency(first.shuttle)) ? 1 : 0;
    cpu = shuttles[target].game.driveCpu(cpu, dt);
    // The CPU moves one racket. Either live shuttle can touch it at the selected position.
    shuttles[1 - target].game.driveCpu(cpu, 0);
  }

  function moveRacket(side, input) {
    if (side !== 'left' || phase === 'finished') return;
    pointer = input;
    for (const { game } of shuttles) game.moveRacket(side, input);
  }

  function view() {
    const rounds = shuttles.map(({ game }) => game.view());
    const active = rounds.flatMap((round, index) => round.phase === 'live' && round.shuttle
      ? [{ ...round.shuttle, flight: round.shuttle.flight * 2 + index, flash: round.flash }]
      : []);
    const shuttleWins = { left: 0, right: 0 };
    for (const round of rounds) {
      if (round.winner) shuttleWins[round.winner]++;
    }
    const notice = phase === 'starting' ? rounds[0].eventText : eventText;
    // A child no longer updates its racket once its shuttle is decided.
    const playing = rounds.find(round => round.phase !== 'finished');
    const left = playing ? playing.left : pointer && {
      x: clamp(pointer.x, 0, center - racketRadius), y: clamp(pointer.y, 0, floor)
    };
    return {
      phase, score, shuttleWins, winner, pointsToWin, cpuLevel, eventText: notice, left, right: cpu, netTop: rounds[0].netTop,
      shuttle: active[0], shuttles: active, gazes: active, flash: Math.max(...active.map(shuttle => shuttle.flash), 0),
      shuttleCalls, firstCallVisible: firstCallTime > 1e-9, settledShuttle,
      shuttleClash: clash,
      cord: { ...rounds.reduce((latest, round) => round.cord.wobble > latest.wobble ? round.cord : latest, rounds[0].cord),
        count: rounds.reduce((total, round) => total + round.cord.count, 0) }
    };
  }

  return { restart, simulate, moveRacket, view };
}
