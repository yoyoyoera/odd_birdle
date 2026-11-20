import { effectLabels, trialEffectLabels, faultReactions } from './game.js';

const effectSounds = {
  SHOCK: 'shock', INVISIBLE: 'invisible', GUST: 'gust', BALLOON: 'balloon',
  FREEZE: 'freeze', 'HIGH NET': 'netUp', 'LOW NET': 'netDown',
  BUMPER: 'bumperIn', DECOY: 'decoyIn', TRAMPOLINE: 'balloon'
};
const effectNames = [...effectLabels, ...trialEffectLabels];
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
      const fresh = (view.pops ?? []).filter(pop => pop.progress < 0.12).length;
      if (previous) {
        // The trampoline's throw-back lights the hit ring but is not a racket hit: it has its own sound.
        const trampolineThrow = view.trampoline?.press && view.trampoline.press.age < 0.3;
        if ((view.flash ?? 0) > (previous.flash ?? 0) + 0.05 && now - lastHit > sameHitMs && !trampolineThrow) {
          lastHit = now;
          // While BALLOON is on, a racket hit is a deep "doong" (the shuttle is a balloon).
          cues.push(view.effect === 'balloon' ? 'doong' : 'hit');
        }
        if (text && text !== previous.text) {
          const effect = effectNames.find(label => text.startsWith(label));
          if (/^\d$/.test(text)) cues.push('tick');
          else if (effect) cues.push(effectSounds[effect]);
          else if (taunts.has(text)) cues.push('wah');
        }
        // BUMPER: the ring starts again at each bounce. DECOY: a fresh burst. TRAMPOLINE: a new press into the floor.
        if ((view.bumper?.ring ?? 0) > (previous.ring ?? 0) + 0.05) cues.push('bumper');
        if (fresh > previous.fresh) cues.push('pop');
        // NET CORD: the tape's little tick.
        if ((view.cord?.count ?? 0) > (previous.cords ?? 0)) cues.push('cord');
        const pressAge = view.trampoline?.press?.age;
        if (pressAge !== undefined && (previous.pressAge === undefined || pressAge < previous.pressAge)) cues.push('boing');
        if (view.phase === 'finished' && previous.phase !== 'finished' && view.winner) {
          cues.push(view.winner === localSide ? 'win' : 'lose');
        } else if (view.score && previous.score) {
          // Every point gets its own sound; the match point is covered by the jingle above.
          const other = localSide === 'left' ? 'right' : 'left';
          if (view.score[localSide] > previous.score[localSide]) cues.push('pointWon');
          else if (view.score[other] > previous.score[other]) cues.push('pointLost');
        }
      }
      previous = { cords: view.cord?.count ?? 0, flash: view.flash ?? 0, text, ring: view.bumper?.ring ?? 0, fresh, pressAge: view.trampoline?.press?.age, phase: view.phase, score: view.score && { ...view.score } };
      return cues;
    }
  };
}
