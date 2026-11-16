// Local-only sampling. Separates animation callback cadence from time spent in game JS.
export function createFrameMeter() {
  let previous;
  const samples = [];
  return {
    record(time, workMs) {
      if (previous !== undefined) {
        const gapMs = time - previous;
        // Hidden tabs and ad pauses should not pollute the visible-play estimate.
        if (gapMs > 0 && gapMs < 250) {
          samples.push({ gapMs, workMs: Math.max(0, workMs) });
          if (samples.length > 180) samples.shift();
        }
      }
      previous = time;
    },
    reset() { previous = undefined; samples.length = 0; },
    summary() {
      if (samples.length < 10) return undefined;
      const percentile = values => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
      return {
        fps: 1000 * samples.length / samples.reduce((sum, s) => sum + s.gapMs, 0),
        gapP95: percentile(samples.map(s => s.gapMs)),
        workP95: percentile(samples.map(s => s.workMs))
      };
    }
  };
}
