// Renders a daily (or ordinary) full-time card to a PNG in headless Chrome.
// Usage: node tools/card-preview.mjs --twist windy --rank 1 --out /path/card.png
//   options: --twist <windy|sudden|smash|five|post|net|shrink|nowarning> (omit for an ordinary card)
//            --rank 1|2|3 (top of the day)  --won 1|0  --mine N --theirs N  --palette 0..3  --seed N
//            --time seconds  --attempt N  --number N  --name u/someone  --line "text"  --level 1..5
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebSocket } = createRequire(path.join(root, 'package.json'))('ws');
const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback; };
const out = path.resolve(option('out', 'card.png'));
const params = new URLSearchParams();
for (const name of ['twist', 'rank', 'won', 'mine', 'theirs', 'palette', 'seed', 'time', 'attempt', 'number', 'name', 'line', 'level', 'players', 'date']) {
  if (option(name) !== undefined) params.set(name, option(name));
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(root)) throw new Error('outside');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = path.join(path.dirname(out), `.chrome-profile-${process.pid}`);
await mkdir(profile, { recursive: true });
const debugPort = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socketUrl;
for (let i = 0; i < 80 && !socketUrl; i++) { try { socketUrl = (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
try {
  const ws = new WebSocket(socketUrl, { perMessageDeflate: false });
  await new Promise(resolve => ws.on('open', resolve));
  let id = 0; const pending = new Map(); const problems = [];
  ws.on('message', data => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') problems.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const send = (method, params = {}, sessionId) => new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, p) => send(method, p, sessionId);
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1350, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${port}/tools/card-preview.html?${params}` });
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await sleep(250);
    done = (await call('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value === 'done';
  }
  if (problems.length) console.error('Page errors:\n' + problems.join('\n'));
  if (!done) throw new Error('The card did not finish drawing.');
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350, scale: 1 } });
  await writeFile(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
} finally {
  chrome.kill(); server.close(); await sleep(400); await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }).catch(() => {});
}
process.exit(0);
