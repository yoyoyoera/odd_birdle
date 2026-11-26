import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('standalone site has the connection tag, while every portal build excludes AdSense and ads.txt', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe' });
  run(['build-pages.js']);
  const site = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(site.slice(site.indexOf('<head>'), site.indexOf('</head>')), /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-8524281695403461"\s+crossorigin="anonymous"><\/script>/);
  assert.equal((site.match(/adsbygoogle\.js/g) ?? []).length, 1);
  assert.equal(readFileSync(new URL('../dist/ads.txt', import.meta.url), 'utf8').trim(), 'google.com, pub-8524281695403461, DIRECT, f08c47fec0942fa0');
  for (const portal of ['itch', 'y8', 'gamepix', 'gamedistribution', 'crazygames', 'newgrounds', 'app']) {
    run(['scripts/build-portal.mjs', portal, ...(portal === 'gamedistribution' ? ['--preview'] : [])]);
    const html = readFileSync(new URL(`../portal/${portal}/index.html`, import.meta.url), 'utf8');
    assert.ok(!/adsbygoogle|googlesyndication|8524281695403461/.test(html), `${portal}: website account leaked`);
    assert.equal(existsSync(new URL(`../portal/${portal}/ads.txt`, import.meta.url)), false);
  }
});

// The Android app build. Kept in this file so its builds never run alongside the ones above (both rewrite dist/).
test('app build: marked, offline, no ads or analytics, STAGES on, ONLINE and the rest off unless asked for', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe' });
  const out = new URL('../portal/app/', import.meta.url);
  run(['scripts/build-portal.mjs', 'app']);
  const html = readFileSync(new URL('index.html', out), 'utf8');
  // Landscape only (touch-layout.js): the column beside the court whatever the window's shape, never the upright pad.
  assert.match(html, /<html lang="en" data-portal="app" data-orientation="landscape" data-features="stages">/);
  // The court fills the screen's height; the icon column floats over the side strip.
  assert.match(html, /html\[data-portal="app"\]\[data-orientation="landscape"\] main \{ display: block;/);
  assert.match(html, /html\[data-portal="app"\]\[data-orientation="landscape"\] #studio-links \{ position: fixed;/);
  assert.ok(existsSync(new URL('touch-layout.js', out)));
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /@font-face[^}]*url\(fonts\/space-grotesk-650-latin\.woff2\)/);
  assert.match(html, /env\(safe-area-inset-top/);
  assert.ok(existsSync(new URL('fonts/space-grotesk-650-latin.woff2', out)));
  assert.ok(existsSync(new URL('app-shell.js', out)));
  assert.ok(existsSync(new URL('features.js', out)));
  assert.ok(!/fonts\.googleapis|og:|twitter:|<a\s|adsbygoogle|googlesyndication|sdk\.crazygames|gamepix\.com|y8\.com|gamedistribution\.com/.test(html));
  for (const file of ['ads.txt', 'og.png', 'fonts.html']) assert.equal(existsSync(new URL(file, out)), false, file);
  // Every file in the app, not only the page: the only web address is the match server's, which only ONLINE uses.
  const addresses = [];
  for (const file of readdirSync(out, { recursive: true })) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    for (const match of readFileSync(new URL(file, out), 'utf8').matchAll(/https?:\/\/[^"'\s)<>`]+/g)) addresses.push(file + ' ' + match[0]);
  }
  assert.deepEqual(addresses, ['portal.js https://oddbirdle.pages.dev/']);

  run(['scripts/build-portal.mjs', 'app', '--features=online,stages']);
  assert.match(readFileSync(new URL('index.html', out), 'utf8'), /data-portal="app" data-orientation="landscape" data-features="online stages"/);
  assert.throws(() => run(['scripts/build-portal.mjs', 'app', '--features=bogus']));
  run(['scripts/build-portal.mjs', 'app']);

  // The website and the other portals carry none of the app's switches, insets or shell.
  run(['scripts/build-portal.mjs', 'itch']);
  const itch = readFileSync(new URL('../portal/itch/index.html', import.meta.url), 'utf8');
  assert.ok(!/data-features|data-orientation|viewport-fit|safe-area/.test(itch));
  assert.equal(existsSync(new URL('../portal/itch/app-shell.js', import.meta.url)), false);
  const site = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(!/data-features|data-orientation|viewport-fit|safe-area/.test(site));
  assert.equal(existsSync(new URL('../dist/app-shell.js', import.meta.url)), false);
});
