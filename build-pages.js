import { copyFile, mkdir } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await mkdir(dist, { recursive: true });
await Promise.all(['index.html', 'fonts.html', 'client.js', 'playback.js', 'game.js', 'brand-shuttles.js', 'room-link.js', 'demo.js', 'analytics.js', 'event-schema.js', 'sound.js', 'sound-synth.js', 'sound-cues.js', 'juice.js', 'net-send.js', 'portal.js', 'og.png']
  .map(file => copyFile(new URL(file, import.meta.url), new URL(file, dist))));
