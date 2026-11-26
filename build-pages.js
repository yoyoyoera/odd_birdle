import { copyFile, mkdir, readdir } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await mkdir(dist, { recursive: true });
await Promise.all(['index.html', 'fonts.html', 'client.js', 'app-storage.js', 'app-share.js', 'stages.js', 'daily.js', 'daily-plan.js', 'daily-client.js', 'card-rank.js', 'stage-progress.js', 'card.js', 'card-lines.js', 'match-stats.js', 'playback.js', 'game.js', 'brand-shuttles.js', 'room-link.js', 'demo.js', 'analytics.js', 'event-schema.js', 'sound.js', 'sound-synth.js', 'sound-cues.js', 'juice.js', 'stands.js', 'crowd.js', 'link-quality.js', 'confetti.js', 'net-send.js', 'net-quality.js', 'portal.js', 'gd-ads.js', 'frame-meter.js', 'fullscreen.js', 'features.js', 'touch-layout.js', 'og.png', 'ads.txt']
  .map(file => copyFile(new URL(file, import.meta.url), new URL(file, dist))));
// The daily card's motifs live in a folder of their own.
await mkdir(new URL('card-motifs/', dist), { recursive: true });
for (const file of await readdir(new URL('./card-motifs/', import.meta.url))) {
  await copyFile(new URL(`card-motifs/${file}`, import.meta.url), new URL(`card-motifs/${file}`, dist));
}
