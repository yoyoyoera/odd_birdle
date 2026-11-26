const encoder = new TextEncoder();

export const toHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

export function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function toBase64Url(bytes) {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function fromBase64Url(text) {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmacKey(secret, usage = 'sign') {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function hmac(secret, text) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(text)));
}

// Compares two strings in time that does not depend on where they differ.
export function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Letters and digits without the ones that look alike (no 0 O 1 I L U).
const codeAlphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

// A short code anyone can copy down: `XXXX-XXXX-XXXX`, the same for the same input and secret.
export async function codeFrom(secret, text, length = 12) {
  const bytes = await hmac(secret, text);
  let code = '';
  for (let i = 0; i < length; i++) code += codeAlphabet[bytes[i] % codeAlphabet.length];
  return code.match(/.{4}/g).join('-');
}

export const normalizeCode = text => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') ?? '';

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
