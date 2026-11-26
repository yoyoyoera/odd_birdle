// The phone app's account and DAILY connection (the app server, app-server/ and docs/APP-API.md).
// Every player starts as a guest (an id and a secret kept on this device); signing in with Apple or Google makes it an account.
// Nothing here knows about the screen: the page gives it a way to fetch, a place to keep the secret and the sign-in plugin.
export const appleBundle = 'com.yoyoyo.oddbirdle';
export const googleWebClientId = '377705180865-egarisfejvkilscd9icvgqvdbsv2srbi.apps.googleusercontent.com';
export const googleIosClientId = '377705180865-m95mhiriqlotc40vlqfmk0pin602fb9v.apps.googleusercontent.com';
const userKey = 'oddbirdle-app-user';

async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createAccount({ base, storage, request = (...args) => fetch(...args), plugins, platform = 'web' }) {
  let credentials;
  let profile;
  let signInReady = false;

  function load() {
    if (credentials) return credentials;
    try {
      const saved = JSON.parse(storage?.getItem(userKey) ?? 'null');
      if (saved?.userId && saved?.secret) credentials = saved;
    } catch { /* a new guest will be made */ }
    return credentials;
  }
  function keep(next) {
    credentials = next;
    profile = undefined;
    try {
      if (next) storage?.setItem(userKey, JSON.stringify(next));
      else storage?.removeItem?.(userKey);
    } catch { /* kept for this visit */ }
  }

  async function call(method, path, { body, auth = true } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (auth && credentials) headers.authorization = `Bearer ${credentials.userId}.${credentials.secret}`;
    try {
      const response = await request(base + 'api/app/v1' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    } catch {
      return { status: 0, body: { ok: false, reason: 'offline' } };
    }
  }

  // Makes a guest when this device has none. Returns false when the server cannot be reached.
  async function ensure() {
    if (load()) return true;
    const made = await call('POST', '/guest', { auth: false });
    if (!made.body.ok) return false;
    keep({ userId: made.body.userId, secret: made.body.secret });
    return true;
  }

  // A call as the signed-in player; if the server no longer knows this device (cleaned away, deleted), start over as a guest.
  async function asPlayer(method, path, options) {
    if (!await ensure()) return { status: 0, body: { ok: false, reason: 'offline' } };
    let answer = await call(method, path, options);
    if (answer.status === 401) {
      keep(undefined);
      if (await ensure()) answer = await call(method, path, options);
    }
    return answer;
  }

  return {
    get ready() { return Boolean(load()); },
    ensure,

    // For createDailyClient({ request }): '/api/daily' + rest  ->  the app server.
    daily: async (url, options = {}) => {
      const rest = String(url).replace(/^\/api\/daily/, '');
      const answer = await asPlayer(options.method ?? 'GET', '/daily' + rest, { body: options.body ? JSON.parse(options.body) : undefined });
      if (answer.status === 0) throw new Error('offline');
      return { status: answer.status, json: async () => answer.body };
    },

    async me() {
      const answer = await asPlayer('GET', '/me');
      if (answer.body.ok) profile = answer.body;
      return answer.body.ok ? answer.body : undefined;
    },
    get profile() { return profile; },

    async deleteCode() {
      const answer = await asPlayer('GET', '/me/delete-code');
      return answer.body.ok ? answer.body.code : undefined;
    },
    async setNickname(nickname) {
      const answer = await asPlayer('PUT', '/me/nickname', { body: { nickname } });
      if (answer.body.ok) profile = undefined;
      return answer.body;
    },
    async report(date, rank) {
      return (await asPlayer('POST', '/report', { body: { date, rank } })).body;
    },
    async deleteMe() {
      const answer = await asPlayer('DELETE', '/me');
      if (answer.body.ok) keep(undefined);
      return answer.body;
    },
    async signOut() {
      if (load()) await call('POST', '/logout');
      try { await plugins?.SocialLogin?.logout?.({ provider: 'google' }); } catch { /* not signed in there */ }
      keep(undefined);
      return { ok: true };
    },

    // Which sign-in buttons this phone offers: Apple only on an iPhone, Google on both.
    providers: () => platform === 'ios' ? ['apple', 'google'] : platform === 'android' ? ['google'] : [],

    // Asks the server for a one-time value, has the provider put its hash into the ID token, and sends the token back.
    async signIn(provider) {
      const plugin = plugins?.SocialLogin;
      if (!plugin || !this.providers().includes(provider)) return { ok: false, reason: 'unavailable' };
      if (!await ensure()) return { ok: false, reason: 'offline' };
      const issued = await call('POST', '/nonce', { auth: false });
      if (!issued.body.ok) return { ok: false, reason: 'offline' };
      const nonce = issued.body.nonce;
      let result;
      try {
        if (!signInReady) {
          await plugin.initialize({
            google: { webClientId: googleWebClientId, iOSClientId: googleIosClientId, iOSServerClientId: googleWebClientId, mode: 'online' },
            apple: { clientId: appleBundle }
          });
          signInReady = true;
        }
        const hashed = await sha256Hex(nonce);
        result = (await plugin.login({
          provider,
          options: provider === 'apple' ? { scopes: [], nonce: hashed } : { scopes: ['openid'], nonce: hashed }
        })).result;
      } catch (error) {
        // Closing the sign-in window is not an error worth showing.
        const cancelled = /cancel|1001|12501|dismiss|16:/i.test(String(error?.message ?? error) + String(error?.code ?? ''));
        return { ok: false, reason: cancelled ? 'cancelled' : 'failed' };
      }
      const idToken = result?.idToken;
      if (!idToken) return { ok: false, reason: 'failed' };
      const answer = await asPlayer('POST', '/login', { body: { provider, idToken, nonce, authorizationCode: result.authorizationCode ?? undefined } });
      if (!answer.body.ok) return { ok: false, reason: answer.body.reason ?? 'failed' };
      // A different account (an earlier sign-in elsewhere): this device now belongs to it.
      if (answer.body.secret) keep({ userId: answer.body.userId, secret: answer.body.secret });
      profile = undefined;
      return { ok: true, merged: Boolean(answer.body.merged), name: answer.body.name };
    }
  };
}
