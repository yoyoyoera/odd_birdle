// Two local origins, like Y8: 8770 is the host page, 8771 serves the game builds (prepare.mjs puts them in games/).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };
for (const [port, dir] of [[8770, 'host'], [8771, 'games']]) {
  const root = fileURLToPath(new URL(dir + '/', import.meta.url));
  createServer(async (q, r) => {
    const path = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname));
    try {
      const data = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path));
      r.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
    } catch { r.writeHead(404).end(); }
  }).listen(port, '127.0.0.1');
}
console.log('host http://127.0.0.1:8770  games http://127.0.0.1:8771');
