// Apply only the rematch UI/protocol change to the user's existing itch archive.
// Usage: node scripts/upgrade-itch-rematch.mjs original.zip updated.zip
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const [input, output] = process.argv.slice(2).map(value => resolve(value));
if (!input || !output || input === output) throw new Error('Provide distinct input and output ZIP paths.');
const work = mkdtempSync(join(tmpdir(), 'oddbirdle-itch-ready-'));
const replace = (source, before, after) => {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error('Unexpected itch source; patch stopped at: ' + before.slice(0, 80));
  }
  return source.replace(before, after);
};
try {
  const entries = execFileSync('unzip', ['-Z1', input], { encoding: 'utf8' }).trim().split('\n');
  if (entries.some(name => name.startsWith('/') || name.split('/').includes('..'))) throw new Error('Unsafe ZIP path.');
  execFileSync('unzip', ['-oq', input, '-d', work]);
  const file = join(work, 'client.js');
  const original = readFileSync(file, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  let client = original.replaceAll('\r\n', '\n');
  client = replace(client, "const recordLabel = document.querySelector('#record');", "const recordLabel = document.querySelector('#record');\nconst rematchLabel = document.querySelector('#rematch-status');");
  client = replace(client, "let mode = 'menu';", "let mode = 'menu';\nlet onlineRound;\nlet rematchReady = false;\nlet rematchStatus = '';\nlet rematchPending = false;");
  client = replace(client, "function leave(message = '', stay = false) {", "function leave(message = '', stay = false) {\n  rematchReady = false;\n  rematchStatus = '';\n  onlineRound = undefined;");
  client = replace(client, "      case 'start':", "      case 'start':\n        onlineRound = message.round;\n        rematchReady = false;\n        rematchStatus = '';");
  client = replace(client, "      case 'state':", "      case 'rematch_wait':\n        if (message.round !== onlineRound) break;\n        rematchReady = message.ready;\n        rematchStatus = message.ready ? 'Waiting for opponent…' : 'Opponent ready. Play again?';\n        break;\n      case 'state':");
  client = replace(client, "  setText(status, message);", "  setText(status, message);\n  rematchLabel.hidden = mode !== 'online' || phase !== 'finished' || !rematchStatus;\n  setText(rematchLabel, rematchStatus);");
  client = replace(client, "  gameControl.hidden = mode !== 'solo' && !(mode === 'online' && phase === 'finished');", "  gameControl.hidden = mode !== 'solo' && !(mode === 'online' && phase === 'finished' && !rematchReady);\n  const controlLabel = mode === 'online' ? 'Ready for rematch' : 'Restart';\n  gameControl.setAttribute('aria-label', controlLabel);\n  gameControl.title = controlLabel;");
  client = replace(client, "  setText(queueStatus, found ? 'Opponent found!' : looking ? 'Looking for a player…' : '');", "  const lookingText = gamePaused ? 'Matchmaking paused' : performance.now() - lastInput >= idleMs ? 'Move to keep searching…' : 'Looking for a player…';\n  setText(queueStatus, found ? 'Opponent found!' : looking ? lookingText : '');");
  client = replace(client, "  const want = quick.on && mode === 'solo'", "  const want = !gamePaused && quick.on && mode === 'solo'");
  client = replace(client, "    if (!want) quick.queued = false;\n  }\n}\nsetInterval(updateQueue", "    if (!want) quick.queued = false;\n  }\n  showQueueStatus();\n}\nsetInterval(updateQueue");
  client = replace(client, "onPortalPause(paused => { gamePaused = paused; if (paused) setRacket(null); });", "onPortalPause(paused => { gamePaused = paused; if (paused) setRacket(null); updateQueue(); });");
  client = replace(client, "gameControl.addEventListener('click', async () => {", "gameControl.addEventListener('click', async () => {\n  if (rematchPending || rematchReady) return;\n  rematchPending = true;\n  try {");
  client = replace(client, "  else send({ type: 'restart' });\n});", "  else {\n    rematchReady = true;\n    rematchStatus = 'Waiting for opponent…';\n    send({ type: 'restart', round: onlineRound });\n  }\n  } finally { rematchPending = false; }\n});");
  writeFileSync(file, client.replaceAll('\n', newline));
  const index = join(work, 'index.html');
  const originalHtml = readFileSync(index, 'utf8');
  const htmlNewline = originalHtml.includes('\r\n') ? '\r\n' : '\n';
  let html = originalHtml.replaceAll('\r\n', '\n');
  // This upload is a generic HTML5 build; mark it so itch uses our matchmaker,
  // rather than trying to open /play on itch's static file host.
  html = replace(html, '<html lang="en">', '<html lang="en" data-portal="itch">');
  html = replace(html, '    #event-banner {', `    #rematch-status { position: absolute; top: calc(50% + clamp(1rem, 4vw, 2rem) + 48px); left: 50%;
      transform: translateX(-50%); margin: 0; width: max-content; max-width: 95%; padding: .15rem .5rem;
      text-align: center; color: var(--ink); background: var(--court);
      font-size: clamp(.65rem, 1.8vw, .9rem); line-height: 1.3; font-weight: 650; pointer-events: none; }
    #event-banner {`);
  html = replace(html, '    <p id="record" hidden></p>', '    <p id="record" hidden></p>\n    <p id="rematch-status" role="status" hidden></p>');
  writeFileSync(index, html.replaceAll('\n', htmlNewline));
  mkdirSync(dirname(output), { recursive: true });
  // The supplied archive is kept intact; all other extracted files stay byte-identical.
  rmSync(output, { force: true });
  execFileSync('zip', ['-qr', output, '.'], { cwd: work });
  console.log('wrote', output);
} finally { rmSync(work, { recursive: true, force: true }); }
