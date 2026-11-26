import { dailyFor, minimumSeconds, utcDate } from '../../daily-plan.js';
import { randomToken } from './util.js';
import { nameOf } from './users.js';

export const boardSize = 5;
const tokenMs = 3 * 60 * 60 * 1000;

// `rank` is stored as the order in which the day's clears happened, and it can have gaps (someone deleted their data). What
// people see is the place among the clears that are still there: 1, 2, 3 with nothing missing.
async function placeOf(db, date, storedRank) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM clears WHERE date = ?1 AND rank <= ?2').bind(date, storedRank).first();
  return row.n;
}

async function clearOf(db, row) {
  return row ? { rank: await placeOf(db, row.date, row.rank), seconds: row.seconds, mine: row.mine, theirs: row.theirs, attempt: row.attempt, date: row.date } : undefined;
}

export async function getBoard(db, date) {
  const { results } = await db.prepare(
    'SELECT c.rank, c.seconds, u.nickname, u.alias FROM clears c JOIN users u ON u.id = c.user_id WHERE c.date = ?1 AND c.rank <= ?2 ORDER BY c.rank'
  ).bind(date, boardSize).all();
  return results.map((row, index) => ({ rank: index + 1, name: nameOf(row), seconds: row.seconds }));
}

export async function getCalendar(db, userId) {
  const { results } = await db.prepare('SELECT date FROM clears WHERE user_id = ?1 ORDER BY date').bind(userId).all();
  return results.map(row => row.date);
}

export async function getToday(db, user, now = Date.now()) {
  const plan = dailyFor(utcDate(now));
  const [attempts, clear, calendar, board] = await Promise.all([
    db.prepare('SELECT used FROM attempts WHERE user_id = ?1 AND date = ?2').bind(user.id, plan.date).first(),
    db.prepare('SELECT * FROM clears WHERE user_id = ?1 AND date = ?2').bind(user.id, plan.date).first(),
    getCalendar(db, user.id),
    getBoard(db, plan.date)
  ]);
  return { plan, attemptsUsed: attempts?.used ?? 0, cleared: await clearOf(db, clear), calendar, board };
}

// One transaction: the try is counted and the token issued together, or neither. A clear already made, or the tries used up,
// counts nothing and gives no token.
export async function startAttempt(db, user, now = Date.now()) {
  const plan = dailyFor(utcDate(now));
  const token = randomToken(24);
  const [, issued] = await db.batch([
    db.prepare(`INSERT INTO attempts(user_id, date, used)
      SELECT ?1, ?2, 1 WHERE NOT EXISTS (SELECT 1 FROM clears WHERE user_id = ?1 AND date = ?2)
      ON CONFLICT(user_id, date) DO UPDATE SET used = used + 1
        WHERE used < ?3 AND NOT EXISTS (SELECT 1 FROM clears WHERE user_id = ?1 AND date = ?2)`).bind(user.id, plan.date, plan.attempts),
    db.prepare(`INSERT INTO tokens(token, user_id, date, attempt, started_at)
      SELECT ?1, ?2, ?3, (SELECT used FROM attempts WHERE user_id = ?2 AND date = ?3), ?4 WHERE changes() > 0`).bind(token, user.id, plan.date, now)
  ]);
  if (issued.meta.changes > 0) {
    const row = await db.prepare('SELECT attempt FROM tokens WHERE token = ?1').bind(token).first();
    return { ok: true, token, attempt: row.attempt, plan };
  }
  const cleared = await db.prepare('SELECT 1 AS yes FROM clears WHERE user_id = ?1 AND date = ?2').bind(user.id, plan.date).first();
  return { ok: false, reason: cleared ? 'cleared' : 'no-attempts', state: await getToday(db, user, now) };
}

async function remember(db, token, now, result) {
  // The first answer is the answer: asking again gets the same one.
  await db.prepare('UPDATE tokens SET finished_at = ?2, result = ?3 WHERE token = ?1 AND result IS NULL').bind(token, now, JSON.stringify(result)).run();
  const row = await db.prepare('SELECT result FROM tokens WHERE token = ?1').bind(token).first();
  return JSON.parse(row.result);
}

// How a try ended. Asking again with the same token returns the first answer, so a lost reply is harmless.
export async function finishAttempt(db, user, { token, won, mine, theirs } = {}, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 64) return { ok: false, reason: 'bad-token' };
  const row = await db.prepare('SELECT * FROM tokens WHERE token = ?1 AND user_id = ?2').bind(token, user.id).first();
  if (!row || now - row.started_at > tokenMs) return { ok: false, reason: 'bad-token' };
  if (row.result) return JSON.parse(row.result);
  const plan = dailyFor(row.date);
  if (won !== true) {
    return remember(db, token, now, { ok: true, cleared: false, state: await getToday(db, user, now) });
  }
  if (!Number.isInteger(mine) || !Number.isInteger(theirs) || mine < plan.points || theirs < 0 || theirs >= Math.max(plan.points, 11)) {
    return remember(db, token, now, { ok: false, reason: 'bad-result' });
  }
  const seconds = Math.round((now - row.started_at) / 100) / 10;
  if (seconds < minimumSeconds(plan.points)) return remember(db, token, now, { ok: false, reason: 'too-fast' });

  const existing = await db.prepare('SELECT * FROM clears WHERE user_id = ?1 AND date = ?2').bind(user.id, plan.date).first();
  if (existing) return remember(db, token, now, { ok: true, cleared: true, record: await clearOf(db, existing), fresh: false });
  try {
    // The place in the day's order and the record are made together; a clash (two tries finishing at once) undoes both.
    await db.batch([
      db.prepare('INSERT INTO day_counters(date, count) VALUES(?1, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1').bind(plan.date),
      db.prepare(`INSERT INTO clears(user_id, date, rank, seconds, mine, theirs, attempt)
        VALUES(?1, ?2, (SELECT count FROM day_counters WHERE date = ?2), ?3, ?4, ?5, ?6)`).bind(user.id, plan.date, seconds, mine, theirs, row.attempt)
    ]);
  } catch {
    const raced = await db.prepare('SELECT * FROM clears WHERE user_id = ?1 AND date = ?2').bind(user.id, plan.date).first();
    if (raced) return remember(db, token, now, { ok: true, cleared: true, record: await clearOf(db, raced), fresh: false });
    throw new Error('could not record the clear');
  }
  const made = await db.prepare('SELECT * FROM clears WHERE user_id = ?1 AND date = ?2').bind(user.id, plan.date).first();
  return remember(db, token, now, { ok: true, cleared: true, record: await clearOf(db, made), fresh: true });
}
