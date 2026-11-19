// Reddit's offline challenges. Each doubles stage keeps its singles rules as a fallback.
import { shapeCount } from './game.js';

function doublesStage(stage, doublesRules) {
  const fallbackRules = stage.rules;
  return {
    ...stage, mode: 'doubles', fallbackRules,
    rules: stage.fallback ? fallbackRules : {
      points: fallbackRules.points,
      cpuLevel: Array.isArray(stage.doubles.opponents) ? Math.max(...stage.doubles.opponents) : stage.doubles.opponents,
      ...doublesRules,
      doubles: stage.doubles
    }
  };
}

export const stages = [
  { id: 1, name: 'Warm-up', description: 'Plain match, no tricks.', rules: { cpuLevel: 1, cpuEase: 1, points: 3, effects: 'none' } },
  { id: 2, name: 'First Surprise', description: 'Random effects join in.', rules: { cpuLevel: 1, cpuEase: 0.7, points: 3 } },
  { id: 3, name: 'Steady', description: 'Nothing but rallies.', rules: { cpuLevel: 2, points: 5, effects: 'none' } },
  { id: 4, name: 'Hot Air', description: 'A balloon floats the shuttle all match.', rules: { cpuLevel: 2, points: 3, permanent: 'balloon', effects: 'none' } },
  { id: 5, name: 'Windy Day', description: 'A steady wind blows one way, left or right.', rules: { cpuLevel: 2, points: 5, permanent: 'wind', windScale: 0.5, effects: 'none' } },
  { id: 6, name: 'Sudden Death', description: "One point. That's all.", rules: { cpuLevel: 3, points: 1, effects: 'none' } },
  { id: 7, name: 'Tiny Bird', description: 'A small shuttle and random effects.', rules: { cpuLevel: 3, points: 5, shuttleSize: 0 } },
  doublesStage({ id: 8, name: 'Doubles I', description: 'Take turns hitting with your partner.', doubles: { partner: 3, opponents: 2 }, rules: { cpuLevel: 3, points: 5, netScale: 'high', effects: 'none' } }, { effects: 'none' }),
  { id: 9, name: 'Take the L', description: 'The shuttle is always an L. Random effects join in.', rules: { cpuLevel: 3, points: 5, shuttleShape: shapeCount - 1 } },
  { id: 10, name: 'Boss: Chaos', boss: true, description: 'Effects come twice as often.', rules: { cpuLevel: 3, points: 7, effectRate: 2 } },
  { id: 11, name: 'Smash Fest', description: 'The CPU sets it up high, then smashes.', rules: { cpuLevel: 4, points: 5, cpuSpike: 1, cpuLift: 1, effects: 'none' } },
  { id: 12, name: 'Five in a Row', description: 'Start 0:4 down. Win five straight.', rules: { cpuLevel: 4, points: 5, startScore: { left: 0, right: 4 }, effects: 'none' } },
  doublesStage({ id: 13, name: 'Doubles II', description: 'Take turns through random effects.', doubles: { partner: 3, opponents: 3 }, rules: { cpuLevel: 4, points: 5, effects: ['decoy'] } }, {}),
  { id: 14, name: 'The Post', description: 'A bumper stays up all match.', rules: { cpuLevel: 2, cpuEase: 0.7, points: 5, permanent: 'bumper', effects: 'none' } },
  { id: 15, name: 'Moving Net', description: 'The net swings from very low to very high.', rules: { cpuLevel: 4, points: 7, netScale: 1, netSway: true, swayMid: 1.15, swayAmp: 0.85, swayPeriod: 4.5, effects: 'none' } },
  { id: 16, name: 'Boss: Storm', boss: true, description: 'More effects, a longer match.', rules: { cpuLevel: 4, points: 9, effectRate: 2 } },
  { id: 17, name: 'Shrinking Bird', description: 'Starts huge and shrinks with every hit.', rules: { cpuLevel: 5, points: 5, shuttleSize: 2, shrink: 0.92, shrinkTo: 5.5, effects: 'none' } },
  doublesStage({ id: 18, name: 'Doubles III', description: 'Stronger rivals and twice as many effects.', doubles: { partner: 3, opponents: 4 }, rules: { cpuLevel: 5, points: 7, netScale: 'low', effectRate: 2 } }, { effectRate: 2 }),
  { id: 19, name: 'No Warning', description: 'Effects come a bit faster, with no countdown.', rules: { cpuLevel: 5, points: 5, effectRate: 1.4, noCountdown: true } },
  { id: 20, name: 'Final Boss', boss: true, description: 'More effects. A bumper that stays.', rules: { cpuLevel: 5, cpuEase: 0.35, points: 9, permanent: 'bumper', effectRate: 1.5 } },
  doublesStage({ id: 21, name: 'Doubles IV', hidden: true, description: 'The strongest rivals and twice as many effects.', doubles: { partner: 3, opponents: 5 }, rules: { cpuLevel: 5, points: 11, effectRate: 2 } }, { effectRate: 2 }),
];

export const validClears = values => [...new Set(Array.isArray(values) ? values.filter(id => Number.isInteger(id) && id >= 1 && id <= 21) : [])].sort((a, b) => a - b);
export const bonusUnlocked = cleared => stages.every(stage => stage.hidden || cleared.includes(stage.id));
export const visibleStages = cleared => stages.filter(stage => !stage.hidden || bonusUnlocked(cleared));
