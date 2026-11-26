// Sign in with Apple, the server's half: when someone signs in, the app also sends Apple's one-time authorization code; the
// server trades it for a refresh token (kept encrypted) so that when the player deletes their data, Apple can be told to
// end the link (App Store rule, TN3194). Needs APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8 text) as secrets.
import { fromBase64Url, toBase64Url, hmac } from './util.js';

const encoder = new TextEncoder();

const pemToBytes = pem => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), char => char.charCodeAt(0));
const part = value => toBase64Url(encoder.encode(JSON.stringify(value)));

export const appleConfigured = env => Boolean(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY && env.APPLE_BUNDLE_ID);

// The "client secret" Apple asks for: a short-lived token signed with our key (ES256).
export async function appleClientSecret(env, now = Date.now()) {
  const key = await crypto.subtle.importKey('pkcs8', pemToBytes(env.APPLE_PRIVATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const issued = Math.floor(now / 1000);
  const signing = part({ alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' }) + '.' +
    part({ iss: env.APPLE_TEAM_ID, iat: issued, exp: issued + 600, aud: 'https://appleid.apple.com', sub: env.APPLE_BUNDLE_ID });
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signing));
  return signing + '.' + toBase64Url(signature);
}

async function form(url, values, fetcher) {
  return fetcher(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString() });
}

// authorization code -> refresh token (or undefined when Apple says no)
export async function exchangeCode(env, code, fetcher = fetch, now = Date.now()) {
  if (!appleConfigured(env) || typeof code !== 'string' || !code) return undefined;
  const response = await form('https://appleid.apple.com/auth/token', {
    client_id: env.APPLE_BUNDLE_ID, client_secret: await appleClientSecret(env, now), code, grant_type: 'authorization_code'
  }, fetcher);
  if (!response.ok) return undefined;
  const body = await response.json().catch(() => ({}));
  return typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
}

export async function revokeToken(env, refreshToken, fetcher = fetch, now = Date.now()) {
  if (!appleConfigured(env) || !refreshToken) return false;
  const response = await form('https://appleid.apple.com/auth/revoke', {
    client_id: env.APPLE_BUNDLE_ID, client_secret: await appleClientSecret(env, now), token: refreshToken, token_type_hint: 'refresh_token'
  }, fetcher);
  return response.ok;
}

// The refresh token is stored encrypted with a key made from a server secret (AES-GCM).
async function storeKey(env) {
  const material = await hmac(env.TOKEN_KEY, 'refresh-token-key');
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await storeKey(env), encoder.encode(text));
  return toBase64Url(iv) + '.' + toBase64Url(cipher);
}

export async function open(env, sealed) {
  const [iv, cipher] = String(sealed ?? '').split('.');
  if (!iv || !cipher) return undefined;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await storeKey(env), fromBase64Url(cipher)));
  } catch {
    return undefined;
  }
}
