import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A file the game imports but the page build forgot to copy is a blank game on the live site: nothing else notices.
test('every file the built game imports is in the build', () => {
  execFileSync(process.execPath, [path.join(root, 'build-pages.js')], { cwd: root });
  const dist = path.join(root, 'dist');
  const scripts = [];
  const walk = folder => {
    for (const entry of readdirSync(folder)) {
      const file = path.join(folder, entry);
      if (statSync(file).isDirectory()) walk(file);
      else if (file.endsWith('.js')) scripts.push(file);
    }
  };
  walk(dist);
  assert.ok(scripts.length > 20);
  for (const file of scripts) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      assert.ok(existsSync(target), `${path.relative(dist, file)} imports ${match[1]} but the build does not ship it`);
    }
  }
});
