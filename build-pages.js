import { copyFile, mkdir } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await mkdir(dist, { recursive: true });
await Promise.all(['index.html', 'fonts.html', 'client.js', 'playback.js', 'game.js', 'brand-shuttles.js', 'room-link.js', 'demo.js', 'analytics.js', 'event-schema.js', 'sound.js', 'sound-synth.js', 'sound-cues.js', 'juice.js', 'stands.js', 'crowd.js', 'link-quality.js', 'confetti.js', 'net-send.js', 'net-quality.js', 'portal.js', 'effect-script.js', 'gd-ads.js', 'frame-meter.js', 'fullscreen.js', 'og.png', 'ads.txt', 'privacy.html', 'delete.html']
  .map(file => copyFile(new URL(file, import.meta.url), new URL(file, dist))));

// Android checks /.well-known/assetlinks.json to open invite links in the app (iOS's file is a function: functions/.well-known/).
// The fingerprints are the upload key's, the debug key's and (once added) Google Play's app-signing key.
await mkdir(new URL('.well-known/', dist), { recursive: true });
await copyFile(new URL('static-well-known/assetlinks.json', import.meta.url), new URL('.well-known/assetlinks.json', dist));
