// The name a player has until they choose a nickname: a mood, a bird and a number, fixed by their id.
const moods = ['Swift', 'Quiet', 'Bold', 'Lucky', 'Sunny', 'Sneaky', 'Brave', 'Calm', 'Nimble', 'Merry', 'Clever', 'Fuzzy', 'Mighty', 'Zesty', 'Plucky', 'Cozy'];
const birds = ['Bird', 'Sparrow', 'Heron', 'Swift', 'Finch', 'Robin', 'Crane', 'Lark', 'Wren', 'Swan', 'Owl', 'Kite', 'Dove', 'Magpie', 'Pigeon', 'Egret'];

export function aliasFor(userId) {
  const a = parseInt(userId.slice(0, 4), 16);
  const b = parseInt(userId.slice(4, 8), 16);
  const c = parseInt(userId.slice(8, 12), 16);
  return `${moods[a % moods.length]}${birds[b % birds.length]}-${100 + (c % 900)}`;
}
