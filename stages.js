// Reddit's solo challenges. Doubles remains metadata until the engine supports four rackets;
// the descriptions below tell players the singles rules they actually play today.
import { shapeCount } from './game.js';

export const stages = [
  { id: 1, name: 'Warm-up', description: 'Plain match, no tricks.', rules: { cpuLevel: 1, cpuEase: 1, points: 3, effects: 'none' } },
  { id: 2, name: 'First Surprise', description: 'Random effects join in.', rules: { cpuLevel: 1, cpuEase: 0.7, points: 3 } },
  { id: 3, name: 'Steady', description: 'Nothing but rallies.', rules: { cpuLevel: 2, points: 5, effects: 'none' } },
  { id: 4, name: 'Hot Air', description: 'A balloon floats the shuttle all match.', rules: { cpuLevel: 2, points: 3, permanent: 'balloon', effects: 'none' } },
  { id: 5, name: 'Windy Day', description: 'A steady wind blows one way, left or right.', rules: { cpuLevel: 2, points: 5, permanent: 'wind', windScale: 0.5, effects: 'none' } },
  { id: 6, name: 'Sudden Death', description: "One point. That's all.", rules: { cpuLevel: 3, points: 1, effects: 'none' } },
  { id: 7, name: 'Tiny Bird', description: 'A small shuttle and random effects.', rules: { cpuLevel: 3, points: 5, shuttleSize: 0 } },
  { id: 8, name: 'Doubles I', mode: 'doubles', fallback: true, description: 'Singles edition: clear the higher net.', doubles: { partner: 3, opponents: 2 }, rules: { cpuLevel: 3, points: 5, netScale: 'high', effects: 'none' } },
  { id: 9, name: 'Take the L', description: 'The shuttle is always an L. Random effects join in.', rules: { cpuLevel: 3, points: 5, shuttleShape: shapeCount - 1 } },
  { id: 10, name: 'Boss: Chaos', description: 'Effects come twice as often.', rules: { cpuLevel: 3, points: 7, effectRate: 2 } },
  { id: 11, name: 'Smash Fest', description: 'The CPU smashes almost everything.', rules: { cpuLevel: 4, points: 5, cpuSpike: 0.9, effects: 'none' } },
  { id: 12, name: 'Five in a Row', description: 'Start 0:4 down. Win five straight.', rules: { cpuLevel: 4, points: 5, startScore: { left: 0, right: 4 }, effects: 'none' } },
  { id: 13, name: 'Doubles II', mode: 'doubles', fallback: true, description: 'Singles edition: spot the real shuttle.', doubles: { partner: 3, opponents: 3 }, rules: { cpuLevel: 4, points: 5, effects: ['decoy'] } },
  { id: 14, name: 'The Post', description: 'A bumper stays up all match.', rules: { cpuLevel: 2, cpuEase: 0.7, points: 5, permanent: 'bumper', effects: 'none' } },
  { id: 15, name: 'Moving Net', description: 'The net rises and falls all match.', rules: { cpuLevel: 4, points: 7, netScale: 1, netSway: true, effects: 'none' } },
  { id: 16, name: 'Boss: Storm', description: 'More effects, a longer match.', rules: { cpuLevel: 4, points: 9, effectRate: 2 } },
  { id: 17, name: 'Shrinking Bird', description: 'The shuttle shrinks with every hit.', rules: { cpuLevel: 5, points: 5, shrink: 0.94, effects: 'none' } },
  { id: 18, name: 'Doubles III', mode: 'doubles', fallback: true, description: 'Singles edition: a low net, more effects.', doubles: { partner: 4, opponents: 4 }, rules: { cpuLevel: 5, points: 7, netScale: 'low', effectRate: 2 } },
  { id: 19, name: 'No Warning', description: 'Effects come a bit faster, with no countdown.', rules: { cpuLevel: 5, points: 5, effectRate: 1.4, noCountdown: true } },
  { id: 20, name: 'Final Boss', description: 'More effects. A bumper that stays.', rules: { cpuLevel: 5, cpuEase: 0.35, points: 9, permanent: 'bumper', effectRate: 1.5 } },
  { id: 21, name: 'Doubles IV', mode: 'doubles', fallback: true, hidden: true, description: 'Bonus singles: the best CPU, more effects.', doubles: { opponents: 5 }, rules: { cpuLevel: 5, points: 11, effectRate: 2 } }
];

export const validClears = values => [...new Set(Array.isArray(values) ? values.filter(id => Number.isInteger(id) && id >= 1 && id <= 21) : [])].sort((a, b) => a - b);
export const bonusUnlocked = cleared => stages.every(stage => stage.hidden || cleared.includes(stage.id));
export const visibleStages = cleared => stages.filter(stage => !stage.hidden || bonusUnlocked(cleared));
