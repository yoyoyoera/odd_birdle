import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATUSES = { live: '공개', review: '심사 중 (사용자 확인)', waiting: '답변·활성화 대기 (사용자 확인)' };
const textHash = text => createHash('sha256').update(text).digest('hex');
const cell = text => String(text ?? '—').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
const kst = date => new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

// Never include response bodies or exception messages: they may contain credentials.
export async function request(url, { fetcher = fetch, headers = {}, method = 'GET', body } = {}) {
  try {
    const response = await fetcher(url, {
      method, body, headers: { 'User-Agent': 'OddBirdle-SiteManager/1.0', ...headers },
      signal: AbortSignal.timeout(15000), redirect: 'error'
    });
    if (!response.ok) return { ok: false, status: response.status, reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > 3_000_000) return { ok: false, status: response.status, reason: 'response_too_large' };
    if (/just a moment|verify you are human|cf-chl-|captcha/i.test(text) && !/<title>Odd Birdle/i.test(text)) {
      return { ok: false, status: response.status, reason: 'challenge' };
    }
    return { ok: true, status: response.status, text };
  } catch { return { ok: false, reason: 'network_or_redirect_error' }; }
}

export function checkPage(result, expectedTitle) {
  if (!result.ok) return { state: 'unknown', reason: result.reason, http: result.status };
  const title = result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  if (!title.toLowerCase().includes(expectedTitle.toLowerCase())) {
    return { state: 'unexpected_page', http: result.status, reason: 'expected_title_missing' };
  }
  // Ignore scripts (dynamic nonces) when detecting changes. A change is NOT proof of a game release.
  const text = result.text.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { state: 'reachable', http: result.status, contentHash: textHash(text) };
}

export function checkListing(result, target) {
  if (!result.ok) return { state: 'unknown', reason: result.reason, http: result.status };
  if (!/<html\b/i.test(result.text) || !/itch\.io/i.test(result.text)) return { state: 'unknown', reason: 'unexpected_response' };
  const hrefs = [...result.text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1].replaceAll('&amp;', '&'));
  const found = hrefs.some(href => { try {
    const url = new URL(href, 'https://itch.io');
    return url.origin + url.pathname.replace(/\/$/, '') === target.replace(/\/$/, '');
  } catch { return false; } });
  return { state: found ? 'found' : 'not_in_response', http: result.status };
}

export function selectMetrics(payload, gameId) {
  const game = payload.games?.find(game => Number(game.id) === gameId);
  if (!game) return { state: 'unknown', reason: 'game_missing_or_no_access' };
  const metrics = {};
  for (const key of ['views_count', 'downloads_count', 'purchases_count']) {
    if (typeof game[key] === 'number' && Number.isFinite(game[key]) && game[key] >= 0) metrics[key] = game[key];
  }
  return Object.keys(metrics).length ? { state: 'ok', metrics } : { state: 'unknown', reason: 'metrics_missing' };
}

export function metricDelta(current, previous) {
  const deltas = {};
  for (const [key, value] of Object.entries(current ?? {})) {
    const old = previous?.[key];
    deltas[key] = typeof old !== 'number' ? null : value >= old ? value - old : 'counter_reset';
  }
  return deltas;
}

export function releaseDraft(release) {
  if (!release || release.draft || release.prerelease || !release.published_at || !release.body?.trim()) return null;
  if (!/^https:\/\/github\.com\/yoyoyoera\/odd_birdle\/releases\/tag\//.test(release.html_url ?? '')) return null;
  const body = release.body.trim().slice(0, 30000);
  const hash = textHash(`${release.tag_name}\n${body}`);
  return {
    id: `github-${release.id}-${hash.slice(0, 12)}`, hash,
    title: `Odd Birdle — ${release.name || release.tag_name}`,
    content: `DRAFT — Verify that this release is live on itch before posting.\n\n# Odd Birdle — ${release.name || release.tag_name}\n\n${body}\n\nRelease notes: ${release.html_url}\n\nPlay on itch: https://studiyo21.itch.io/odd-birdle\n`,
    publishedAt: release.published_at, url: release.html_url
  };
}

async function jsonRequest(url, options) {
  const result = await request(url, options);
  if (!result.ok) return result;
  try {
    const data = JSON.parse(result.text);
    return data.errors || data.success === false ? { ok: false, reason: 'api_error' } : { ok: true, data };
  } catch { return { ok: false, reason: 'invalid_json' }; }
}

export async function collect(config, { env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const report = { checkedAt: now.toISOString(), platforms: [], discovery: [] };
  // Only the configured public pages are fetched. No game iframe/JS is loaded or executed.
  for (const platform of config.platforms) {
    report.platforms.push({ ...platform, observation: platform.status === 'live' && platform.url
      ? checkPage(await request(platform.url, { fetcher }), platform.title)
      : { state: 'manual_status', reason: 'no_public_url' } });
  }
  for (const listing of config.discovery) report.discovery.push({ ...listing, ...checkListing(await request(listing.url, { fetcher }), listing.target) });

  if (env.ITCH_API_KEY) {
    const result = await jsonRequest('https://api.itch.io/profile/games', { fetcher, headers: { Authorization: `Bearer ${env.ITCH_API_KEY}` } });
    report.itch = result.ok ? selectMetrics(result.data, config.itchGameId) : { state: 'unknown', reason: result.reason };
  } else report.itch = { state: 'not_connected', reason: 'ITCH_API_KEY_missing' };

  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    // Read-only Analytics Engine query. GamePix/Y8/GD currently disable this custom analytics.
    if (!/^[a-f\d]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID)) report.analytics = { state: 'unknown', reason: 'invalid_account_id' };
    else {
      const result = await jsonRequest(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, {
        fetcher, method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        body: "SELECT blob1 AS name, blob2 AS mode, blob7 AS source, SUM(_sample_interval) AS n FROM oddbirdle_events WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 IN ('page_view', 'game_start', 'game_finish', 'rematch', 'quick_match_enter', 'quick_match_found') GROUP BY name, mode, source FORMAT JSON"
      });
      report.analytics = result.ok && Array.isArray(result.data.data)
        ? { state: 'ok', days: 7, rows: result.data.data.map(({ name, mode, source, n }) => ({ name, mode, source, n: Number(n) })).filter(row => Number.isFinite(row.n)) }
        : { state: 'unknown', reason: result.reason ?? 'missing_rows' };
    }
  } else report.analytics = { state: 'not_connected', reason: 'CLOUDFLARE_credentials_missing' };

  const releaseResponse = await jsonRequest(`https://api.github.com/repos/${config.github}/releases?per_page=20`, {
    fetcher, headers: { Accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) }
  });
  report.releases = releaseResponse.ok && Array.isArray(releaseResponse.data)
    ? { state: 'ok', drafts: releaseResponse.data.map(releaseDraft).filter(Boolean) }
    : { state: 'unknown', reason: releaseResponse.reason ?? 'unexpected_response', drafts: [] };
  return report;
}

export function renderReport(report, previous) {
  const states = { reachable: '접속 확인', unknown: '확인 불가', unexpected_page: '예상과 다른 페이지', manual_status: '공개 URL 미등록', found: '목록에서 확인', not_in_response: '이번 응답에 없음' };
  const lines = [`# Odd Birdle 사이트 관리`, '', `확인: ${kst(report.checkedAt)} KST`, '', '| 사이트 | 등록 상태 | 자동 확인 |', '|---|---|---|'];
  for (const site of report.platforms) {
    const old = previous?.platforms?.find(row => row.id === site.id)?.observation;
    const changed = old?.contentHash && site.observation.contentHash && old.contentHash !== site.observation.contentHash;
    lines.push(`| ${cell(site.name)} | ${cell(STATUSES[site.status] ?? site.status)} | ${states[site.observation.state]}${changed ? ' · 페이지 텍스트 변경 감지' : ''} |`);
  }
  lines.push('', '심사 상태는 사용자 확인 기록이다. 공개 페이지 접속만으로 심사 통과나 멀티플레이 정상 작동을 판정하지 않는다.', '', '## 노출 확인', '');
  for (const listing of report.discovery) lines.push(`- ${listing.name}: **${states[listing.state]}** ([페이지](${listing.url}))`);
  lines.push('', '목록은 매번 달라진다. 첫 페이지에 없거나 요청이 차단됐다는 이유만으로 미색인·인기 하락을 확정하지 않는다.', '', '## itch 지표', '');
  if (report.itch.state === 'ok') {
    const deltas = metricDelta(report.itch.metrics, previous?.itchBaseline?.metrics ?? previous?.itch?.metrics);
    for (const [key, value] of Object.entries(report.itch.metrics)) {
      const label = { views_count: '누적 페이지 조회', downloads_count: '누적 다운로드', purchases_count: '누적 구매' }[key];
      const d = deltas[key];
      lines.push(`- ${label}: ${value} (${d === null ? '첫 기준값' : d === 'counter_reset' ? '카운터 감소·초기화: 증가량 산출 안 함' : `직전 수집 대비 +${d}`})`);
    }
    const baselineAt = previous?.itchBaseline?.checkedAt ?? (previous?.itch?.state === 'ok' ? previous.checkedAt : null);
    if (baselineAt) lines.push(`- 비교 기준: ${kst(baselineAt)} KST (일별 증가량으로 단정하지 않음)`);
  } else lines.push(report.itch.state === 'not_connected' ? '연결 전: `ITCH_API_KEY`를 설정하면 공식 API에서 수집한다. 누락값을 0으로 표시하지 않는다.' : `이번 수집 확인 불가 (${cell(report.itch.reason)}).`);
  lines.push('', '## 게임 내 지표 · 최근 7일', '');
  if (report.analytics.state === 'ok') {
    lines.push('| 출처 | 이벤트 | 모드 | 추정 건수 |', '|---|---|---|---:|');
    for (const row of report.analytics.rows) lines.push(`| ${cell(row.source || 'site')} | ${cell(row.name)} | ${cell(row.mode)} | ${cell(row.n)} |`);
    if (!report.analytics.rows.length) lines.push('', '연결은 됐지만 이 기간에 반환된 이벤트가 없다.');
  } else lines.push(report.analytics.state === 'not_connected' ? '연결 전: Cloudflare Account Analytics: Read 토큰과 계정 ID가 필요하다.' : `이번 수집 확인 불가 (${cell(report.analytics.reason)}).`);
  lines.push('', 'GamePix·Y8·GD는 현재 자체 분석 수집을 꺼 둔 빌드다. 위 지표로 이 사이트들의 방문·플레이 수를 판단하지 않는다. 온라인 이벤트는 양쪽 브라우저에서 각각 발생하며 사람 수·고유 방문자 수와 다르다.', '', '## 개발일지', '');
  if (report.releases.state !== 'ok') lines.push(`GitHub 공개 릴리스 조회 불가 (${cell(report.releases.reason)}).`);
  else if (!report.releases.drafts.length) lines.push('정식 GitHub 릴리스가 없어 새 업데이트 글을 생성하지 않았다. 커밋만으로 배포 완료를 추정하지 않는다.');
  else for (const draft of report.releases.drafts) lines.push(`- ${cell(draft.title)}: drafts/${draft.id}.md — itch 배포 여부 확인 후 게시`);
  lines.push('', '초안만 생성한다. itch 공식 API에 개발일지 게시 엔드포인트가 문서화돼 있지 않아 게시·빌드 교체·심사 변경은 실행하지 않는다.', '', '페이지 점검은 HTML만 요청하며 플레이·광고를 실행하지 않는다. HTML 요청 자체는 플랫폼 페이지 조회에 포함될 수 있다. 기본 점검은 6시간 이내 재요청을 막는다.', '');
  return lines.join('\n');
}

async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`Invalid JSON: ${path}`); }
}
async function atomicWrite(path, content) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, path);
}

export async function run({ out = join(ROOT, 'output'), configPath = join(ROOT, 'config.json'), force = false, env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const config = await readJSON(configPath);
  await mkdir(out, { recursive: true, mode: 0o700 });
  const lock = join(out, '.lock');
  try { await mkdir(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('Another run is active, or a previous run was interrupted. Check output/.lock before removing it.'); throw error; }
  try {
    const previous = await readJSON(join(out, 'state.json'), null);
    const age = now - new Date(previous?.checkedAt ?? 0);
    if (!force && previous && age >= 0 && age < config.minimumIntervalHours * 3600000) return { cached: true, path: join(out, 'latest.md') };
    const report = await collect(config, { env, fetcher, now });
    const markdown = renderReport(report, previous);
    await mkdir(join(out, 'drafts'), { recursive: true, mode: 0o700 });
    for (const draft of report.releases.drafts) {
      // Preserve manually edited drafts. A changed release body has a new hash/id.
      try { await writeFile(join(out, 'drafts', `${draft.id}.md`), draft.content, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const baseline = report.itch.state === 'ok' ? { checkedAt: report.checkedAt, metrics: report.itch.metrics } : previous?.itchBaseline ?? (previous?.itch?.state === 'ok' ? { checkedAt: previous.checkedAt, metrics: previous.itch.metrics } : null);
    const state = { ...report, itchBaseline: baseline };
    const stamp = now.toISOString().replaceAll(':', '-');
    await atomicWrite(join(out, `${stamp}.md`), markdown);
    await atomicWrite(join(out, 'latest.md'), markdown);
    await atomicWrite(join(out, 'state.json'), JSON.stringify(state, null, 2) + '\n');
    return { cached: false, path: join(out, 'latest.md'), report };
  } finally { await rm(lock, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const allowed = new Set(['--out', '--force']);
  try {
    let out;
    for (let i = 0; i < args.length; i++) {
      if (!allowed.has(args[i])) throw new Error('Usage: node tools/site-manager/bot.mjs [--out DIRECTORY] [--force]');
      if (args[i] === '--out') { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--out requires a directory'); out = resolve(args[++i]); }
    }
    const result = await run({ out, force: args.includes('--force') });
    console.log(`${result.cached ? 'Cached (6-hour cooldown)' : 'Checked'}: ${result.path}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
