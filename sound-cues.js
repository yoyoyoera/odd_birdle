import { effectLabels, faultReactions } from './game.js';

const effectSounds = {
  SHOCK: 'shock', INVISIBLE: 'invisible', GUST: 'gust', BALLOON: 'balloon',
  FREEZE: 'freeze', 'HIGH NET': 'netUp', 'LOW NET': 'netDown'
};
const taunts = new Set([...faultReactions, 'Sleepy?']);
// Two flashes this close together are one hit (local prediction, then the server's copy).
const sameHitMs = 130;

// Turns what the screen shows into sound cues, so CPU and online play sound alike.
export function createCueTracker() {
  let previous;
  let lastHit = -Infinity;
  return {
    reset() {
      previous = undefined;
    },
    cues(view, now, localSide = 'left') {
      const cues = [];
      if (!view) return cues;
      const text = view.eventText ?? '';
      if (previous) {
        if ((view.flash ?? 0) > (previous.flash ?? 0) + 0.05 && now - lastHit > sameHitMs) {
          lastHit = now;
          cues.push('hit');
        }
        if (text && text !== previous.text) {
          const effect = effectLabels.find(label => text.startsWith(label));
          if (/^\d$/.test(text)) cues.push('tick');
          else if (effect) cues.push(effectSounds[effect]);
          else if (taunts.has(text)) cues.push('wah');
        }
        if (view.phase === 'finished' && previous.phase !== 'finished' && view.winner) {
          cues.push(view.winner === localSide ? 'win' : 'lose');
        }
      }
      previous = { flash: view.flash ?? 0, text, phase: view.phase };
      return cues;
    }
  };
}
