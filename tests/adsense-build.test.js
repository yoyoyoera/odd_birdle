import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('standalone site has the connection tag, while every portal build excludes AdSense and ads.txt', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe' });
  run(['build-pages.js']);
  const site = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(site.slice(site.indexOf('<head>'), site.indexOf('</head>')), /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-8524281695403461"\s+crossorigin="anonymous"><\/script>/);
  assert.equal((site.match(/adsbygoogle\.js/g) ?? []).length, 1);
  assert.equal(readFileSync(new URL('../dist/ads.txt', import.meta.url), 'utf8').trim(), 'google.com, pub-8524281695403461, DIRECT, f08c47fec0942fa0');
  for (const portal of ['itch', 'y8', 'gamepix', 'gamedistribution', 'crazygames', 'newgrounds']) {
    run(['scripts/build-portal.mjs', portal, ...(portal === 'gamedistribution' ? ['--preview'] : [])]);
    const html = readFileSync(new URL(`../portal/${portal}/index.html`, import.meta.url), 'utf8');
    assert.ok(!/adsbygoogle|googlesyndication|8524281695403461/.test(html), `${portal}: website account leaked`);
    assert.equal(existsSync(new URL(`../portal/${portal}/ads.txt`, import.meta.url)), false);
  }
});
