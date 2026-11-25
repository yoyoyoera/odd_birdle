// What the crowd is feeling right now, worked out once per frame from the match: who is cheering, how many
// hits the rally has had (a long one gets people up out of their seats), which effect is running, and which
// crowd sounds to play. Pure (no drawing, no audio), so it can be tested.

import { touchLimitFault } from './game.js';

const surprising = ['shock', 'highNet', 'lowNet', 'balloon', 'bumper', 'decoy', 'trampoline'];
// A comeback: the side that scores has been this many points behind and has now caught up or gone ahead.
export const comebackFrom = 3;
// A wave may start once a rally reaches this many hits: only sometimes (waveChance), and at most once a match.
export const waveRally = 14;
export const waveChance = 0.4;
export const waveSeconds = 2.6;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// `random` decides when a wave starts (tests pass their own).
export function createCrowd({ random = Math.random } = {}) {
  let rally = 0;
  let tension = 0;
  let behind = { left: 0, right: 0 };
  let lastTotal = 0;
  let wave;
  let waveDone = false;
  let standing = 0;
  let last;
  let cheer;
  let boo;
  let effect;
  let effectSince = -Infinity;
  let surpriseSince = -Infinity;
  let cords;
  let clock = 0;
  return {
    reset() {
      rally = 0; standing = 0; last = undefined; cheer = undefined; boo = undefined; effect = undefined; clock = 0; cords = undefined;
      tension = 0; behind = { left: 0, right: 0 }; lastTotal = 0; wave = undefined; waveDone = false;
    },
    get rally() { return rally; },
    update(view, events, now) {
      const cues = [];
      const dt = last === undefined ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      if (view.effect !== effect) {
        effect = view.effect;
        effectSince = now;
        if (surprising.includes(effect)) surpriseSince = now;
      }
      // NET CORD: the whole crowd goes "ooh" and jumps a little.
      const cordNow = view.cord?.count ?? 0;
      if (cords !== undefined && cordNow > cords) {
        surpriseSince = now;
        cues.push('ooh');
      }
      cords = cordNow;
      // The crowd's own clock, which stands still during FREEZE: nobody sways, nobody waves.
      if (effect !== 'freeze') clock += dt * 1000;
      if (view.phase === 'starting' || (boo && now - boo.since >= 850)) boo = undefined;
      // A new match (the score went back down): nobody is behind, and a wave may come again.
      const score = view.score;
      const total = score ? score.left + score.right : 0;
      if (total < lastTotal) {
        behind = { left: 0, right: 0 };
        waveDone = false;
      }
      lastTotal = total;
      for (const event of events) {
        if (event.type === 'hit' && view.phase === 'live') {
          rally++;
          // A very long rally: now and then (not every time), a wave runs along the stands.
          if (rally === waveRally && !waveDone) {
            waveDone = true;
            if (random() < waveChance) wave = { since: now };
          }
        } else if (event.type === 'score') {
          boo = view.eventText === touchLimitFault
            ? { side: event.side === 'left' ? 'right' : 'left', since: now }
            : undefined;
          cheer = boo ? undefined : { side: event.side, since: now };
          rally = 0;
          const other = event.side === 'left' ? 'right' : 'left';
          // A comeback: this side had been well behind and has caught up or gone ahead. Everyone on it goes wild.
          if (cheer && score && behind[event.side] >= comebackFrom && score[event.side] >= score[other]) {
            cheer.big = true;
            behind[event.side] = 0;
            if (view.phase !== 'finished') cues.push('applause');
          }
          // Only the end of a match (and a comeback) gets a sound from the crowd; every point would be too much noise.
          if (view.phase === 'finished') cues.push('applauseBig');
        }
      }
      if (score) {
        behind.left = Math.max(behind.left, score.right - score.left);
        behind.right = Math.max(behind.right, score.left - score.right);
      }
      if (wave && now - wave.since > waveSeconds * 1000) wave = undefined;
      // Match point: the stands hold their breath and lean in, until the point is over.
      const matchPoint = score && view.pointsToWin && view.phase !== 'finished' &&
        Math.max(score.left, score.right) === view.pointsToWin - 1;
      tension += ((matchPoint ? 1 : 0) - tension) * Math.min(1, dt * 3);
      if (view.phase === 'finished' && view.winner && !boo) {
        if (!cheer || cheer.side !== view.winner) cheer = { side: view.winner, since: now };
        cheer.finale = true;
      } else if (cheer?.finale) {
        cheer = undefined;
      }
      const target = view.phase === 'live' ? clamp((rally - 6) / 4, 0, 1) : 0;
      if (view.phase !== 'live') wave = undefined;
      standing += (target - standing) * Math.min(1, dt * 2.5);
      const wind = view.force?.type === 'wind' ? Math.sign(view.force.x) || 0 : 0;
      return {
        cues, cheer, boo,
        mood: {
          effect, effectAge: now - effectSince, wind, standing, clock, tension,
          // How far the wave has gone, 0 to 1 (undefined when there is none).
          wave: wave ? (now - wave.since) / (waveSeconds * 1000) : undefined,
          surprise: Math.max(0, 1 - (now - surpriseSince) / 1100)
        }
      };
    }
  };
}
