import { originSource } from '../../origins.js';
import { json, sha256Hex } from './util.js';
import { allow } from './throttle.js';
import {
  authenticate, clean, createGuest, deleteUser, ensureDeleteCode, findByDeleteCode, profileOf, reportPlayer, setNickname
} from './users.js';
import { finishAttempt, getToday, startAttempt } from './daily.js';
import { consumeNonce, issueNonce, signIn, verifyIdToken } from './login.js';
import { exchangeCode, open, revokeToken, seal } from './apple.js';
import { parseReport, recordError } from './errors.js';

const base = '/api/app/v1';

// Requests per hour from one address, by what they ask for.
const limits = { guest: 20, login: 40, nonce: 80, delete: 10, report: 40, error: 30 };

function corsHeaders(origin) {
  return origin && originSource(origin)
    ? {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-max-age': '86400',
      vary: 'origin'
    }
    : {};
}

async function body(request) {
  try {
    const text = await request.text();
    if (text.length > 8192) return undefined;
    return text ? JSON.parse(text) : {};
  } catch {
    return undefined;
  }
}

// Revokes Apple's side of the sign-in (if there is one) and removes the player's data.
async function eraseUser(env, db, userId, fetcher) {
  const { results } = await db.prepare("SELECT refresh_token_enc FROM identities WHERE user_id = ?1 AND provider = 'apple'").bind(userId).all();
  for (const row of results) {
    const token = row.refresh_token_enc ? await open(env, row.refresh_token_enc) : undefined;
    if (token) await revokeToken(env, token, fetcher).catch(() => false);
  }
  await deleteUser(db, userId);
}

export function createHandler({ fetcher = fetch, now = () => Date.now() } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin);
    const reply = (data, status = 200) => json(data, status, cors);
    const fail = (reason, status = 400) => reply({ ok: false, reason }, status);

    if (!url.pathname.startsWith(base + '/')) return new Response('Not found', { status: 404 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // Only the app and our own pages may call this API.
    if (origin && !originSource(origin)) return new Response('Not found', { status: 404 });

    const db = env.DB;
    const route = request.method + ' ' + url.pathname.slice(base.length);
    const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const limited = async name => !(await allow(db, name + ':' + address, limits[name], now()));

    try {
      if (route === 'POST /guest') {
        if (await limited('guest')) return fail('rate-limited', 429);
        const guest = await createGuest(db, now());
        const user = await authenticate(db, `Bearer ${guest.userId}.${guest.secret}`, now());
        await ensureDeleteCode(db, env, user);
        return reply({ ok: true, ...guest, account: false });
      }
      if (route === 'POST /nonce') {
        if (await limited('nonce')) return fail('rate-limited', 429);
        return reply({ ok: true, nonce: await issueNonce(db, now()) });
      }
      if (route === 'POST /error') {
        // From the app, with no sign-in: what broke, never who.
        if (await limited('error')) return fail('rate-limited', 429);
        const report = parseReport(await body(request));
        if (!report) return fail('bad-request');
        await recordError(db, report, now());
        return reply({ ok: true });
      }
      if (route === 'POST /delete') {
        if (await limited('delete')) return fail('rate-limited', 429);
        const data = await body(request);
        if (!data || typeof data.code !== 'string') return fail('bad-request');
        const user = await findByDeleteCode(db, env, data.code);
        if (!user) return fail('not-found', 404);
        await eraseUser(env, db, user.id, fetcher);
        return reply({ ok: true });
      }

      const header = request.headers.get('authorization');
      const user = await authenticate(db, header, now());

      if (route === 'POST /login') {
        if (await limited('login')) return fail('rate-limited', 429);
        const data = await body(request);
        if (!data || !['apple', 'google'].includes(data.provider)) return fail('bad-request');
        if (!await consumeNonce(db, data.nonce, now())) return fail('bad-nonce', 400);
        let identity;
        try {
          identity = await verifyIdToken({ provider: data.provider, idToken: data.idToken, nonceHash: await sha256Hex(data.nonce), env, fetcher, now: now() });
        } catch {
          return fail('bad-token', 401);
        }
        let refreshTokenEnc;
        if (identity.provider === 'apple' && typeof data.authorizationCode === 'string') {
          const refresh = await exchangeCode(env, data.authorizationCode, fetcher, now()).catch(() => undefined);
          if (refresh) refreshTokenEnc = await seal(env, refresh);
        }
        const result = await signIn(db, { ...identity, guest: user, refreshTokenEnc }, now());
        if (!result.ok) return fail(result.reason, result.status);
        const account = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(result.userId).first();
        await ensureDeleteCode(db, env, account);
        return reply({ ok: true, ...profileOf(account), secret: result.secret, merged: result.merged });
      }

      if (!user) return fail('unauthorized', 401);

      switch (route) {
        case 'GET /me': return reply({ ok: true, ...profileOf(user) });
        case 'GET /me/delete-code': return reply({ ok: true, code: await ensureDeleteCode(db, env, user) });
        case 'PUT /me/nickname': {
          const data = await body(request);
          const result = await setNickname(db, user, data?.nickname, now());
          return result.ok ? reply(result) : fail(result.reason, result.status);
        }
        case 'DELETE /me':
          await eraseUser(env, db, user.id, fetcher);
          return reply({ ok: true });
        case 'POST /logout': {
          const secret = /\.([A-Za-z0-9_-]+)$/.exec(header)?.[1];
          if (secret) await db.prepare('DELETE FROM devices WHERE user_id = ?1 AND secret_hash = ?2').bind(user.id, await sha256Hex(secret)).run();
          return reply({ ok: true });
        }
        case 'GET /daily': return reply({ ok: true, ...await getToday(db, user, now()), me: { name: profileOf(user).name, account: Boolean(user.is_account) } });
        case 'POST /daily/start': {
          const result = await startAttempt(db, user, now());
          return reply(result, result.ok ? 200 : 409);
        }
        case 'POST /daily/finish': {
          const data = await body(request);
          if (!data) return fail('bad-request');
          const result = await finishAttempt(db, user, data, now());
          return reply(result, result.ok ? 200 : 422);
        }
        case 'POST /report': {
          if (await limited('report')) return fail('rate-limited', 429);
          const data = await body(request);
          if (!data || typeof data.date !== 'string' || !Number.isInteger(data.rank)) return fail('bad-request');
          const result = await reportPlayer(db, user, data.date, data.rank, now());
          return result.ok ? reply({ ok: true }) : fail(result.reason, result.status);
        }
        default:
          return fail('not-found', 404);
      }
    } catch (error) {
      console.error('app api error', error?.message);
      return fail('server-error', 500);
    }
  };
}

const handler = createHandler();

export default {
  fetch: (request, env) => handler(request, env),
  // Once a day: guests nobody has used for 90 days, old tokens and counters.
  scheduled: (event, env) => clean(env.DB)
};
