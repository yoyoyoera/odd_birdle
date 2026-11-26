// ?effect=invasion&rally=1&after=3 : bring chosen effects in on time, for recording. Off unless the address asks.
//
//   &effect=gust,invasion,decoy    only these effects, in this order (gust wind, decoy, bumper, trampoline, balloon,
//                                  freeze, shock, invisible, highnet, lownet, invasion), one per rally
//   &rally=1                       the rally the first one comes in (default 1)
//   &after=2                       seconds into that rally it is called (it then counts 3-2-1 like a random one; default 2)

const effectNames = {
  gust: 'wind', wind: 'wind', decoy: 'decoy', bumper: 'bumper', trampoline: 'trampoline', balloon: 'balloon',
  freeze: 'freeze', shock: 'shock', invisible: 'invisible', highnet: 'highNet', lownet: 'lowNet', invasion: 'invasion'
};

export function parseEffectScript(search = '') {
  const params = new URLSearchParams(search);
  const effects = (params.get('effect') ?? '').toLowerCase().split(',').map(name => effectNames[name.trim()]).filter(Boolean);
  if (!effects.length) return undefined;
  const number = (name, fallback, low) => {
    const value = Number(params.get(name));
    return params.has(name) && Number.isFinite(value) && value >= low ? value : fallback;
  };
  return { effects, rally: Math.floor(number('rally', 1, 1)), after: number('after', 2, 0) };
}

// `update(view, seconds, trigger)` every frame; `trigger(id)` asks the game to start counting 3-2-1 (true when it did).
// One effect per rally, in order. An effect whose rally ends before it has started is tried again in the next one.
export function createEffectScript({ effects = [], rally = 1, after = 2 } = {}) {
  let next = 0;
  let lastTotal = 0;
  let rallyTime = 0;
  let firedIn = 0;
  let waiting;
  return {
    get pending() { return effects.length - next; },
    reset() { next = 0; lastTotal = 0; rallyTime = 0; firedIn = 0; waiting = undefined; },
    update(view, seconds, trigger) {
      if (!effects.length) return;
      const total = view.score ? view.score.left + view.score.right : 0;
      if (total < lastTotal) { next = 0; firedIn = 0; waiting = undefined; }
      if (total !== lastTotal) { lastTotal = total; rallyTime = 0; waiting = undefined; }
      const number = total + 1;
      if (waiting) {
        if (view.effect === waiting) { next++; firedIn = number; waiting = undefined; }
        else if (view.phase !== 'live') waiting = undefined;
        return;
      }
      if (view.phase !== 'live') return;
      rallyTime += seconds;
      if (next < effects.length && !view.effect && !view.armed && number >= rally && number > firedIn && rallyTime >= after &&
          trigger(effects[next])) {
        waiting = effects[next];
      }
    }
  };
}
