// The browser's side of the daily challenge: it asks the Reddit app's server what today's challenge is, asks for a try,
// and reports how the try ended. The server keeps the truth (the tries used, the clear time, the rank).
export function createDailyClient({ request = (...args) => fetch(...args) } = {}) {
  async function call(path, options) {
    try {
      const response = await request('/api/daily' + path, { headers: { 'content-type': 'application/json' }, ...options });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    } catch {
      return { status: 0, body: { error: 'offline' } };
    }
  }
  return {
    // { plan, attemptsUsed, cleared?, calendar } or undefined when the server cannot be reached.
    async today() {
      const { status, body } = await call('');
      return status === 200 && body.plan ? body : undefined;
    },
    // { ok: true, token, attempt, plan } or { ok: false, reason: 'cleared' | 'no-attempts' | 'offline', state? }
    async start() {
      const { status, body } = await call('/start', { method: 'POST', body: '{}' });
      if (status === 0) return { ok: false, reason: 'offline' };
      return body.ok ? body : { ok: false, reason: body.reason ?? 'offline', state: body.state };
    },
    // { ok: true, cleared, record? } or { ok: false, reason }
    async finish(token, { won, mine, theirs }) {
      const { status, body } = await call('/finish', { method: 'POST', body: JSON.stringify({ token, won, mine, theirs }) });
      if (status === 0) return { ok: false, reason: 'offline' };
      return body.ok ? body : { ok: false, reason: body.reason ?? 'offline' };
    }
  };
}

// A month of days for the calendar: [{ day, cleared }] starting from day 1 of the month the date is in, with the weekday
// (0 = Monday) of the first, so the grid can be laid out.
export function monthDays(date, clearedDates) {
  const [year, month] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const set = new Set(clearedDates);
  const days = Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    return { day, cleared: set.has(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`) };
  });
  return { offset: (first.getUTCDay() + 6) % 7, days };
}
