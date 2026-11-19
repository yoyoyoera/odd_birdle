// The daily challenges: each day one of these twists is the challenge (picked from the date), the same for everyone.
// Every twist is one of the stage rules, so nothing new has to be designed by hand each day.
import { stages } from './stages.js';

const stageRules = id => stages.find(stage => stage.id === id).rules;

export const dailyAttempts = 5;

export const dailyChallenges = [
  { key: 'windy', name: 'Windy Day', description: 'A steady wind blows one way, left or right.', from: 5, attempts: dailyAttempts },
  { key: 'sudden', name: 'Sudden Death', description: "One point. One try. That's all.", from: 6, attempts: 1 },
  { key: 'smash', name: 'Smash Fest', description: 'The CPU sets it up high, then smashes.', from: 11, attempts: dailyAttempts },
  { key: 'five', name: 'Five in a Row', description: 'Start 0:4 down. Win five straight.', from: 12, attempts: dailyAttempts },
  { key: 'post', name: 'The Post', description: 'A bumper stays up all match.', from: 14, attempts: dailyAttempts },
  { key: 'net', name: 'Moving Net', description: 'The net swings from very low to very high.', from: 15, attempts: dailyAttempts },
  { key: 'shrink', name: 'Shrinking Bird', description: 'Starts huge and shrinks with every hit.', from: 17, attempts: dailyAttempts },
  { key: 'nowarning', name: 'No Warning', description: 'Effects come a bit faster, with no countdown.', from: 19, attempts: dailyAttempts }
].map(challenge => ({ ...challenge, rules: { ...stageRules(challenge.from) } }));

export const dailyKeys = dailyChallenges.map(challenge => challenge.key);
export const challengeByKey = key => dailyChallenges.find(challenge => challenge.key === key);
