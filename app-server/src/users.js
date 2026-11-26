import { aliasFor } from './alias.js';
import { codeFrom, normalizeCode, randomHex, randomToken, sameText, sha256Hex, hmac, toHex } from './util.js';
import { checkNickname } from './nickname.js';

const day = 24 * 60 * 60 * 1000;
export const guestKeepMs = 90 * day;
export const nicknameChangeMs = day;
export const reportsToHide = 3;

export const nameOf = user => user.nickname ?? user.alias;

// A new player with nothing but an id and a secret that stays on their device. The server keeps only the secret's hash.
export async function createGuest(db, now = Date.now()) {
  const id = randomHex(16);
  const secret = randomToken(32);
  const hash = await sha256Hex(secret);
  await db.batch([
    db.prepare('INSERT INTO users(id, alias, created_at, last_seen) VALUES(?1, ?2, ?3, ?3)').bind(id, aliasFor(id), now),
    db.prepare('INSERT INTO devices(user_id, secret_hash, created_at) VALUES(?1, ?2, ?3)').bind(id, hash, now)
  ]);
  return { userId: id, secret, name: aliasFor(id) };
}

// A further device for an existing player (signing in elsewhere).
export async function addDevice(db, userId, now = Date.now()) {
  const secret = randomToken(32);
  await db.prepare('INSERT INTO devices(user_id, secret_hash, created_at) VALUES(?1, ?2, ?3)').bind(userId, await sha256Hex(secret), now).run();
  return secret;
}

// "Bearer <userId>.<secret>" -> the user, or undefined.
export async function authenticate(db, header, now = Date.now()) {
  const match = /^Bearer ([0-9a-f]{32})\.([A-Za-z0-9_-]{20,64})$/.exec(header ?? '');
  if (!match) return undefined;
  const [, id, secret] = match;
  const hash = await sha256Hex(secret);
  const device = await db.prepare('SELECT secret_hash FROM devices WHERE user_id = ?1 AND secret_hash = ?2').bind(id, hash).first();
  if (!device || !sameText(device.secret_hash, hash)) return undefined;
  const user = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
  if (!user) return undefined;
  // `last_seen` is only written about once a day: reading is the common case.
  if (now - user.last_seen > day / 4) await db.prepare('UPDATE users SET last_seen = ?2 WHERE id = ?1').bind(id, now).run();
  return user;
}

export async function deleteCodeFor(env, userId) {
  return codeFrom(env.DELETE_CODE_KEY, 'delete:' + userId);
}

async function lookupHash(env, code) {
  return toHex(await hmac(env.DELETE_CODE_KEY, 'lookup:' + normalizeCode(code)));
}

// The code is worked out from the id and the server's key whenever it is wanted; only its lookup hash is stored.
export async function ensureDeleteCode(db, env, user) {
  const code = await deleteCodeFor(env, user.id);
  const hash = await lookupHash(env, code);
  if (user.delete_code_hash !== hash) await db.prepare('UPDATE users SET delete_code_hash = ?2 WHERE id = ?1').bind(user.id, hash).run();
  return code;
}

export function profileOf(user) {
  return {
    userId: user.id,
    name: nameOf(user),
    alias: user.alias,
    nickname: user.nickname ?? undefined,
    account: Boolean(user.is_account),
    nicknameLocked: Boolean(user.nickname_locked)
  };
}

export async function setNickname(db, user, input, now = Date.now()) {
  if (!user.is_account) return { ok: false, reason: 'login-required', status: 403 };
  if (user.nickname_locked) return { ok: false, reason: 'nickname-locked', status: 403 };
  if (user.nickname_changed_at && now - user.nickname_changed_at < nicknameChangeMs) return { ok: false, reason: 'nickname-taken-today', status: 429 };
  const checked = checkNickname(input);
  if (!checked.ok) return { ...checked, status: 422 };
  await db.prepare('UPDATE users SET nickname = ?2, nickname_changed_at = ?3 WHERE id = ?1').bind(user.id, checked.nickname, now).run();
  return { ok: true, name: checked.nickname };
}

// Everything about a player: used by "Delete my data" (from the app) and by the code on the web page.
export async function deleteUser(db, userId) {
  await db.batch([
    db.prepare('DELETE FROM clears WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM attempts WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM tokens WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM reports WHERE reporter_id = ?1 OR target_id = ?1').bind(userId),
    db.prepare('DELETE FROM identities WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM devices WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?1').bind(userId)
  ]);
}

export async function findByDeleteCode(db, env, code) {
  const hash = await lookupHash(env, code);
  return db.prepare('SELECT * FROM users WHERE delete_code_hash = ?1').bind(hash).first();
}

// A player reports a name on the board. Three different players hiding it puts the plain alias back and locks the nickname.
export async function reportPlayer(db, reporter, date, rank, now = Date.now()) {
  // `rank` is the place people see on the board (1 = the first still there).
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) return { ok: false, reason: 'not-found', status: 404 };
  const target = await db.prepare('SELECT u.* FROM clears c JOIN users u ON u.id = c.user_id WHERE c.date = ?1 ORDER BY c.rank LIMIT 1 OFFSET ?2').bind(date, rank - 1).first();
  if (!target) return { ok: false, reason: 'not-found', status: 404 };
  if (target.id === reporter.id) return { ok: false, reason: 'own-name', status: 422 };
  await db.prepare('INSERT OR IGNORE INTO reports(reporter_id, target_id, date, created_at) VALUES(?1, ?2, ?3, ?4)').bind(reporter.id, target.id, date, now).run();
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE target_id = ?1').bind(target.id).first();
  let hidden = false;
  if (n >= reportsToHide && target.nickname) {
    await db.prepare('UPDATE users SET nickname = NULL, nickname_locked = 1 WHERE id = ?1').bind(target.id).run();
    hidden = true;
  }
  return { ok: true, hidden };
}

// Guests nobody has used for 90 days, and tokens and counters that no longer matter.
export async function clean(db, now = Date.now()) {
  const old = await db.prepare('SELECT id FROM users WHERE is_account = 0 AND last_seen < ?1').bind(now - guestKeepMs).all();
  for (const { id } of old.results) await deleteUser(db, id);
  await db.batch([
    db.prepare('DELETE FROM tokens WHERE started_at < ?1').bind(now - 2 * day),
    db.prepare('DELETE FROM nonces WHERE expires_at < ?1').bind(now),
    db.prepare('DELETE FROM throttle WHERE window < ?1').bind(Math.floor(now / 3600000) - 3),
    db.prepare('DELETE FROM errors WHERE last_seen < ?1').bind(now - 60 * day)
  ]);
  return old.results.length;
}
