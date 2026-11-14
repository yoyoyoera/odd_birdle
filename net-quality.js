// A short, anonymous summary of how an online match went for one player: coarse buckets only
// (no exact numbers, no ids), so the stats can show how phones and wired players really fare.
export const pingBuckets = ['<50', '50-100', '100-200', '200+'];
export const lateBuckets = ['<30', '30-80', '80-150', '150+'];
export const guessBuckets = ['<1', '1-3', '3-10', '10+'];
export const fpsBuckets = ['<25', '25-45', '45+'];
export const linkTypes = ['4g', '3g', '2g', 'slow-2g', 'unknown'];
export const inputTypes = ['touch', 'mouse'];

const pingEdges = [50, 100, 200];
const lateEdges = [30, 80, 150];
const guessEdges = [1, 3, 10];
const fpsEdges = [25, 45];

function bucket(value, edges, labels) {
  const index = edges.findIndex(edge => value < edge);
  return labels[index < 0 ? labels.length - 1 : index];
}

const median = list => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];

// Collects numbers while an online match runs; summary() turns them into the buckets above.
export function createNetMeter({ minSeconds = 15, minPings = 3 } = {}) {
  let active = false;
  let rtts = [];
  let lates = [];
  let frames = 0;
  let activeMs = 0;
  let lastFrame;

  return {
    begin() {
      active = true;
      rtts = [];
      lates = [];
      frames = 0;
      activeMs = 0;
      lastFrame = undefined;
    },
    end() {
      active = false;
    },
    rtt(ms) {
      if (active && Number.isFinite(ms) && ms >= 0 && rtts.length < 400) rtts.push(ms);
    },
    late(ms) {
      if (active && Number.isFinite(ms) && ms >= 0 && lates.length < 400) lates.push(ms);
    },
    // Time between frames counts only while the page is really running (a backgrounded tab does not).
    frame(now) {
      if (!active) return;
      if (lastFrame !== undefined && now - lastFrame < 250) {
        activeMs += now - lastFrame;
        frames++;
      }
      lastFrame = now;
    },
    // guessedPct: share of frames drawn from a guess because the next snapshot was late.
    summary({ guessedPct = 0, touch = false, link } = {}) {
      if (!active || activeMs < minSeconds * 1000 || rtts.length < minPings || !lates.length) return undefined;
      return {
        name: 'net_quality',
        ping: bucket(median(rtts), pingEdges, pingBuckets),
        late: bucket(median(lates), lateEdges, lateBuckets),
        guess: bucket(guessedPct, guessEdges, guessBuckets),
        fps: bucket(frames / (activeMs / 1000), fpsEdges, fpsBuckets),
        input: touch ? 'touch' : 'mouse',
        link: linkTypes.includes(link) ? link : 'unknown'
      };
    }
  };
}
