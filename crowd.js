// What the crowd is feeling right now, worked out once per frame from the match: who is cheering, how many
// hits the rally has had (a long one gets people up out of their seats), which effect is running, and which
// crowd sounds to play. Pure (no drawing, no audio), so it can be tested.

import { touchLimitFault, touchLimitReason } from './game.js';

const surprising = ['shock', 'highNet', 'lowNet', 'balloon', 'bumper', 'decoy', 'trampoline'];
const protest = (winner, since) => ({ side: winner === 'left' ? 'right' : 'left', since });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function createCrowd() {
  let rally = 0;
  let standing = 0;
  let last;
  let cheer;
  let boo;
  let shuttleCalls = 0;
  let effect;
  let effectSince = -Infinity;
  let surpriseSince = -Infinity;
  let cords;
  let clock = 0;
  return {
    reset() {
      rally = 0; standing = 0; last = undefined; cheer = undefined; boo = undefined; effect = undefined; clock = 0; cords = undefined; shuttleCalls = 0;
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
      for (const event of events) {
        if (event.type === 'hit' && view.phase === 'live') {
          rally++;
        } else if (event.type === 'score') {
          boo = view.eventText === touchLimitFault
            ? protest(event.side, now)
            : undefined;
          cheer = boo ? undefined : { side: event.side, since: now };
          rally = 0;
          // Only the end of a match gets a sound from the crowd; every point would be too much noise.
          if (view.phase === 'finished') cues.push('applauseBig');
        }
      }
      const calls = view.shuttleCalls;
      const foul = calls?.slice(shuttleCalls).find(call => call.reason === touchLimitReason);
      shuttleCalls = calls?.length ?? 0;
      if (foul) {
        boo = protest(foul.winner, now);
        cheer = undefined;
      }
      if (view.phase === 'finished' && view.winner && !boo) {
        if (!cheer || cheer.side !== view.winner) cheer = { side: view.winner, since: now };
        cheer.finale = true;
      } else if (cheer?.finale) {
        cheer = undefined;
      }
      const target = view.phase === 'live' ? clamp((rally - 6) / 4, 0, 1) : 0;
      standing += (target - standing) * Math.min(1, dt * 2.5);
      const wind = view.force?.type === 'wind' ? Math.sign(view.force.x) || 0 : 0;
      return {
        cues, cheer, boo,
        mood: {
          effect, effectAge: now - effectSince, wind, standing, clock,
          surprise: Math.max(0, 1 - (now - surpriseSince) / 1100)
        }
      };
    }
  };
}
