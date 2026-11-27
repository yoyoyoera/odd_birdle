// A scripted player for the tests that need long rallies: whenever the shuttle comes to its side it swings at it and lobs it
// back across (a short quick stroke from below), then lifts the racket. Seeded, so a test always plays the same match.
export function lobPlayer(seed = 777) {
  let state = seed;
  const rand = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return game => {
    const frame = game.contactFrame();
    if (!frame?.canHit || frame.locked?.left || frame.x >= 450 || frame.y <= 200 || frame.y >= 420) return;
    const dx = 24 + rand() * 12;
    const dy = 45 + rand() * 20;
    const ms = 80 + rand() * 15;
    game.moveRacket('left', null);
    game.moveRacket('left', { x: frame.x - dx, y: frame.y + dy, time: 0 }, frame);
    game.moveRacket('left', { x: frame.x, y: frame.y, time: ms }, { ...frame, time: 0, age: 0 });
    game.moveRacket('left', null);
  };
}
