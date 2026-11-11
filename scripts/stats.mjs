// Prints play numbers from Workers Analytics Engine.
// Usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/stats.mjs [days]
// The token only needs "Account Analytics: Read".
import { pathToFileURL } from 'node:url';

export function summarize(rows) {
  const count = (filter) => rows.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value))
    .reduce((sum, row) => sum + Number(row.n), 0);
  const rate = (part, whole) => whole ? Math.round(part / whole * 100) + '%' : '-';
  const visits = count({ name: 'page_view' });
  const returning = count({ name: 'page_view', returning: 'yes' });
  const cpuStarts = count({ name: 'game_start', mode: 'cpu' });
  const onlineStarts = count({ name: 'game_start', mode: 'online' });
  const cpuFinishes = count({ name: 'game_finish', mode: 'cpu' });
  const onlineFinishes = count({ name: 'game_finish', mode: 'online' });
  const levels = ['random', '1', '2', '3', '4', '5']
    .map(level => `${level === 'random' ? 'RANDOM' : 'Lv' + level} ${count({ name: 'game_start', mode: 'cpu', level })}`).join(' · ');
  return [
    `방문 ${visits} (재방문 ${returning}, ${rate(returning, visits)})`,
    `CPU 시작 ${cpuStarts}  [${levels}]`,
    `CPU 완주 ${cpuFinishes} (완주율 ${rate(cpuFinishes, cpuStarts)}), 승 ${count({ name: 'game_finish', mode: 'cpu', result: 'win' })}`,
    `CPU 한 판 더 ${count({ name: 'rematch', mode: 'cpu' })} (재경기율 ${rate(count({ name: 'rematch', mode: 'cpu' }), cpuFinishes)})`,
    `온라인 시작 ${onlineStarts} (방 만든 쪽 ${count({ name: 'game_start', via: 'create' })} · 코드 입장 ${count({ name: 'game_start', via: 'code' })} · 링크 입장 ${count({ name: 'game_start', via: 'link' })})`,
    `온라인 완주 ${onlineFinishes} (완주율 ${rate(onlineFinishes, onlineStarts)}), 한 판 더 ${count({ name: 'rematch', mode: 'online' })}`,
    `방 만들기 ${count({ name: 'room_create' })}, 링크 복사 ${count({ name: 'link_copy' })}`,
    '(온라인 숫자는 두 사람 각자의 브라우저에서 한 번씩 세어짐)'
  ].join('\n');
}

async function main() {
  const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? 7) || 7));
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
  if (!account || !token) {
    console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
    process.exit(1);
  }
  const sql = `SELECT blob1 AS name, blob2 AS mode, blob3 AS level, blob4 AS via, blob5 AS result,
    blob6 AS returning, SUM(_sample_interval) AS n FROM oddbirdle_events
    WHERE timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY name, mode, level, via, result, returning FORMAT JSON`;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: sql
  });
  if (!response.ok) {
    console.error(`Query failed (${response.status}): ${await response.text()}`);
    process.exit(1);
  }
  const { data = [] } = await response.json();
  console.log(`최근 ${days}일\n` + summarize(data));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
