import { sha256Hex } from './util.js';

// What the app tells us when it breaks: the kind of error, where, on which platform and version. Nothing about the person:
// no user id, no address, no device id. Text is cut short and cleaned of anything that looks like an address, an e-mail
// or a long number, so a message cannot carry personal data by accident.
const platforms = ['ios', 'android', 'web'];
const modes = ['menu', 'solo', 'online', 'stages', 'account', 'join', 'waiting', 'connecting', 'other'];
export const maxErrorsPerKind = 1000000;

export function clean(text, length) {
  return String(text ?? '')
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<id>')
    .replace(/\d{6,}/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}

export function parseReport(data) {
  if (!data || typeof data !== 'object') return undefined;
  const message = clean(data.message, 200);
  if (!message) return undefined;
  return {
    message,
    place: clean(data.place, 120),
    platform: platforms.includes(data.platform) ? data.platform : 'web',
    version: clean(data.version, 20) || 'unknown',
    mode: modes.includes(data.mode) ? data.mode : 'other'
  };
}

export async function recordError(db, report, now = Date.now()) {
  const signature = (await sha256Hex(report.message + '|' + report.place)).slice(0, 16);
  await db.prepare(`INSERT INTO errors(signature, platform, version, message, place, mode, count, first_seen, last_seen)
    VALUES(?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)
    ON CONFLICT(signature, platform, version) DO UPDATE SET count = MIN(count + 1, ?8), last_seen = ?7, mode = ?6`)
    .bind(signature, report.platform, report.version, report.message, report.place, report.mode, now, maxErrorsPerKind).run();
  return signature;
}
