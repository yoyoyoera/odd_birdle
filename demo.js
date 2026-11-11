import { center, clamp, createGame, floor, racketRadius, step } from './game.js';

// Title-screen demo: the normal CPU plays the right side and a small autopilot
// plays the left side through the same racket input a person would use.
const restX = 205;
const restY = 330;
const chaseSpeed = 620;
const swingSeconds = 0.18;
const finishedPause = 2.2;
// Mistakes keep points short enough to show a score change every so often.
const mistakes = { long: 0.08, short: 0.08, lazy: 0.08 };
const smashChance = 0.3;

export function createDemo(random = Math.random) {
  const game = createGame({ withCpu: true });
  let time = 0;
  let racket;
  let swing;
  let previous;
  let pause = 0;
  let aim;

  function restart() {
    // Lower levels miss now and then, so new birds come out often.
    game.restart(0, 1 + Math.floor(random() * 3));
    racket = { x: restX, y: restY };
    swing = undefined;
    previous = undefined;
    pause = 0;
  }

  function pickAim() {
    const roll = random();
    if (roll < mistakes.lazy) return { lazy: true };
    if (roll < mistakes.lazy + mistakes.long) return { x: 1000 + random() * 80, flat: false };
    if (roll < mistakes.lazy + mistakes.long + mistakes.short) return { x: center - 20, flat: true };
    return { x: 560 + random() * 220, flat: false, smash: random() < smashChance };
  }

  function steer(view) {
    const bird = view.phase === 'live' ? view.shuttle : undefined;
    const velocity = bird && previous && previous.flight === bird.flight
      ? { x: (bird.x - previous.x) / step, y: (bird.y - previous.y) / step } : { x: 0, y: 0 };
    previous = bird;

    if (swing) {
      // Stop the follow-through once the bird is struck so it is not hit twice.
      if (!bird || bird.flight !== swing.flight) {
        swing = undefined;
        return;
      }
      swing.remaining -= step;
      racket.x += swing.vx * step;
      racket.y += swing.vy * step;
      if (swing.remaining <= 0) swing = undefined;
      return;
    }

    let targetX = restX;
    let targetY = restY;
    const incoming = bird && bird.x < center - 4 && velocity.y >= 0;
    if (incoming && aim?.lazy) {
      // Step out of the way and watch this one drop.
      targetX = bird.x < 200 ? 330 : 90;
    } else if (incoming) {
      // Plan a lob that lands deep on the other side, then line up behind the
      // bird along that swing so the racket only meets it on the way through.
      aim ??= pickAim();
      // A high bird near the net is a chance to smash it down the other side.
      const smash = aim.smash && bird.y < 210 && bird.x > 250;
      const swingX = smash ? 700 : clamp((aim.x - bird.x) / 1.04, 60, 820);
      const swingY = smash ? 380 : aim.flat ? -260 : -640;
      const length = Math.hypot(swingX, swingY);
      const lead = 0.05;
      const ahead = { x: bird.x + velocity.x * lead, y: bird.y + velocity.y * lead };
      const backOff = bird.size + racketRadius + 12;
      targetX = ahead.x - swingX / length * backOff;
      targetY = Math.min(ahead.y - swingY / length * backOff, floor - 14);
      if (bird.canHit && Math.hypot(racket.x - targetX, racket.y - targetY) < 14) {
        swing = { vx: swingX, vy: swingY, remaining: swingSeconds, flight: bird.flight };
        aim = undefined;
        return;
      }
    } else {
      aim = undefined;
    }
    const distance = Math.hypot(targetX - racket.x, targetY - racket.y);
    const travel = Math.min(distance, chaseSpeed * step);
    if (distance > 0) {
      racket.x += (targetX - racket.x) / distance * travel;
      racket.y += (targetY - racket.y) / distance * travel;
    }
  }

  function advance(dt) {
    time += dt;
    const view = game.view();
    if (view.phase === 'finished') {
      pause += dt;
      if (pause >= finishedPause) restart();
      return;
    }
    steer(view);
    racket.x = clamp(racket.x, 0, center - racketRadius);
    racket.y = clamp(racket.y, 0, floor);
    game.moveRacket('left', { x: racket.x, y: racket.y, time: time * 1000 });
    game.simulate(dt);
  }

  function view() {
    // The demo is scenery: no banners, scores or screen shake.
    return { ...game.view(), eventText: '', shake: 0 };
  }

  restart();
  return { advance, view, restart };
}
