import { fromBase64Url, randomHex, sha256Hex, toBase64Url, sameText } from './util.js';
import { addDevice } from './users.js';
import { aliasFor } from './alias.js';

const googleKeysUrl = 'https://www.googleapis.com/oauth2/v3/certs';
const appleKeysUrl = 'https://appleid.apple.com/auth/keys';
export const nonceMs = 10 * 60 * 1000;

const decoder = new TextDecoder();
const parseJson = bytes => JSON.parse(decoder.decode(bytes));

// Public keys of each provider, kept for an hour (they rotate slowly).
const keyCache = new Map();
async function keysOf(url, fetcher, now) {
  const cached = keyCache.get(url);
  if (cached && now - cached.at < 3600000) return cached.keys;
  const response = await fetcher(url);
  if (!response.ok) throw new Error('keys unavailable');
  const { keys } = await response.json();
  keyCache.set(url, { at: now, keys });
  return keys;
}
export const forgetKeys = () => keyCache.clear();

// Checks a provider's ID token (RS256): its signature against the provider's public key, the issuer, the audience (our own
// app), the time, and the one-time value (nonce) we handed out. Returns { provider, sub } or throws.
export async function verifyIdToken({ provider, idToken, nonceHash, env, fetcher = fetch, now = Date.now() }) {
  const parts = String(idToken ?? '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = parseJson(fromBase64Url(parts[0]));
  const claims = parseJson(fromBase64Url(parts[1]));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected algorithm');
  const settings = provider === 'apple'
    ? { url: appleKeysUrl, issuers: ['https://appleid.apple.com'], audience: env.APPLE_BUNDLE_ID }
    : provider === 'google'
      ? { url: googleKeysUrl, issuers: ['accounts.google.com', 'https://accounts.google.com'], audience: env.GOOGLE_SERVER_CLIENT_ID }
      : undefined;
  if (!settings || !settings.audience) throw new Error('unknown provider');
  const keys = await keysOf(settings.url, fetcher, now);
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) { forgetKeys(); throw new Error('unknown key'); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), signed)) throw new Error('bad signature');
  if (!settings.issuers.includes(claims.iss)) throw new Error('wrong issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(settings.audience)) throw new Error('wrong audience');
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 < now) throw new Error('expired');
  if (Number.isFinite(claims.iat) && claims.iat * 1000 > now + 5 * 60 * 1000) throw new Error('issued in the future');
  if (!claims.sub || typeof claims.sub !== 'string') throw new Error('no subject');
  if (!sameText(String(claims.nonce ?? ''), nonceHash)) throw new Error('wrong nonce');
  return { provider, sub: claims.sub };
}

// One-time values: the server hands one out, the app gives its hash to the provider, and the server only accepts the token
// that carries that hash, once.
export async function issueNonce(db, now = Date.now()) {
  const nonce = randomHex(16);
  await db.prepare('INSERT INTO nonces(nonce, expires_at) VALUES(?1, ?2)').bind(nonce, now + nonceMs).run();
  return nonce;
}

export async function consumeNonce(db, nonce, now = Date.now()) {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce)) return false;
  const { meta } = await db.prepare('DELETE FROM nonces WHERE nonce = ?1 AND expires_at >= ?2').bind(nonce, now).run();
  return meta.changes === 1;
}

// A guest becomes the account of someone who had signed in before: records are kept, the better place on a shared day stays.
export async function mergeInto(db, fromId, toId) {
  await db.batch([
    // Same day cleared on both: the later place goes.
    db.prepare(`DELETE FROM clears WHERE user_id = ?1 AND date IN (SELECT date FROM clears WHERE user_id = ?2)
      AND rank > (SELECT rank FROM clears c WHERE c.user_id = ?2 AND c.date = clears.date)`).bind(fromId, toId),
    db.prepare(`DELETE FROM clears WHERE user_id = ?2 AND date IN (SELECT date FROM clears WHERE user_id = ?1)
      AND rank > (SELECT rank FROM clears c WHERE c.user_id = ?1 AND c.date = clears.date)`).bind(fromId, toId),
    db.prepare('UPDATE clears SET user_id = ?2 WHERE user_id = ?1').bind(fromId, toId),
    db.prepare(`INSERT INTO attempts(user_id, date, used) SELECT ?2, date, used FROM attempts WHERE user_id = ?1 AND true
      ON CONFLICT(user_id, date) DO UPDATE SET used = max(used, excluded.used)`).bind(fromId, toId),
    db.prepare('DELETE FROM attempts WHERE user_id = ?1').bind(fromId),
    db.prepare('UPDATE tokens SET user_id = ?2 WHERE user_id = ?1').bind(fromId, toId),
    db.prepare('DELETE FROM reports WHERE reporter_id = ?1 OR target_id = ?1').bind(fromId),
    db.prepare('DELETE FROM devices WHERE user_id = ?1').bind(fromId),
    db.prepare('DELETE FROM users WHERE id = ?1').bind(fromId)
  ]);
}

// What signing in does. The player is a guest (or nobody yet); the provider says who they are.
//   a new provider identity   -> the guest becomes that account (or a new account is made)
//   a known identity          -> that account, and a guest's records join it
export async function signIn(db, { provider, sub, guest, refreshTokenEnc }, now = Date.now()) {
  const known = await db.prepare('SELECT user_id FROM identities WHERE provider = ?1 AND sub = ?2').bind(provider, sub).first();
  if (guest?.is_account && (!known || known.user_id !== guest.id)) return { ok: false, reason: 'already-signed-in', status: 409 };
  if (known) {
    if (guest && guest.id === known.user_id) return { ok: true, userId: known.user_id, merged: false, unchanged: true };
    if (guest) await mergeInto(db, guest.id, known.user_id);
    if (refreshTokenEnc) await db.prepare('UPDATE identities SET refresh_token_enc = ?3 WHERE provider = ?1 AND sub = ?2').bind(provider, sub, refreshTokenEnc).run();
    const secret = await addDevice(db, known.user_id, now);
    return { ok: true, userId: known.user_id, secret, merged: Boolean(guest) };
  }
  if (guest) {
    await db.batch([
      db.prepare('INSERT INTO identities(provider, sub, user_id, refresh_token_enc) VALUES(?1, ?2, ?3, ?4)').bind(provider, sub, guest.id, refreshTokenEnc ?? null),
      db.prepare('UPDATE users SET is_account = 1 WHERE id = ?1').bind(guest.id)
    ]);
    return { ok: true, userId: guest.id, merged: false, unchanged: true };
  }
  const id = randomHex(16);
  await db.batch([
    db.prepare('INSERT INTO users(id, alias, created_at, last_seen, is_account) VALUES(?1, ?2, ?3, ?3, 1)').bind(id, aliasFor(id), now),
    db.prepare('INSERT INTO identities(provider, sub, user_id, refresh_token_enc) VALUES(?1, ?2, ?3, ?4)').bind(provider, sub, id, refreshTokenEnc ?? null)
  ]);
  const secret = await addDevice(db, id, now);
  return { ok: true, userId: id, secret, merged: false };
}
