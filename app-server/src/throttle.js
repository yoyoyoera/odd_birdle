// Most requests per hour for one key (an address and what it asks for): a count per hour, in the database.
export async function allow(db, key, limit, now = Date.now()) {
  const window = Math.floor(now / 3600000);
  const { results } = await db.prepare(
    'INSERT INTO throttle(key, window, count) VALUES(?1, ?2, 1) ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count'
  ).bind(key, window).all();
  return results[0].count <= limit;
}
