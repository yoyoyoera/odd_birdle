// What the crowd is feeling right now, worked out once per frame from the match: who is cheering, how many
// hits the rally has had (a long one gets people up out of their seats), which effect is running, and which
// crowd sounds to play. Pure (no drawing, no audio), so it can be tested.

const surprising = ['shock', 'highNet', 'lowNet', 'balloon'];
const murmurAt = [8, 15];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function createCrowd() {
  let rally = 0;
  let standing = 0;
  let last;
  let cheer;
  let effect;
  let effectSince = -Infinity;
  let surpriseSince = -Infinity;
  let clock = 0;
  return {
    reset() {
      rally = 0; standing = 0; last = undefined; cheer = undefined; effect = undefined; clock = 0;
    },
    get rally() { return rally; },
    update(view, events, now, localSide = 'left') {
      const cues = [];
      const dt = last === undefined ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      if (view.effect !== effect) {
        effect = view.effect;
        effectSince = now;
        if (surprising.includes(effect)) surpriseSince = now;
      }
      // The crowd's own clock, which stands still during FREEZE: nobody sways, nobody waves.
      if (effect !== 'freeze') clock += dt * 1000;
      for (const event of events) {
        if (event.type === 'hit' && view.phase === 'live') {
          rally++;
          if (murmurAt.includes(rally)) cues.push('murmur');
        } else if (event.type === 'score') {
          cheer = { side: event.side, since: now };
          rally = 0;
          cues.push(view.phase === 'finished' ? 'applauseBig' : 'applause');
          if (event.side !== localSide) cues.push('groan');
        }
      }
      if (view.phase === 'finished' && view.winner) {
        if (!cheer || cheer.side !== view.winner) cheer = { side: view.winner, since: now };
        cheer.finale = true;
      } else if (cheer?.finale) {
        cheer = undefined;
      }
      const target = view.phase === 'live' ? clamp((rally - 6) / 4, 0, 1) : 0;
      standing += (target - standing) * Math.min(1, dt * 2.5);
      const wind = view.force?.type === 'wind' ? Math.sign(view.force.x) || 0 : 0;
      return {
        cues, cheer,
        mood: {
          effect, effectAge: now - effectSince, wind, standing, clock,
          surprise: Math.max(0, 1 - (now - surpriseSince) / 1100)
        }
      };
    }
  };
}
