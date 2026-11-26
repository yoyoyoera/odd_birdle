// A D1-shaped database on Node's built-in SQLite, for tests: the same SQL engine D1 runs, with the same prepare/bind/batch
// calls (a batch is one transaction that rolls back whole when a statement fails).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind: (...next) => statement(sql, next),
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() { return exec(sql, values); }
  });
  function exec(sql, values) {
    const prepared = sqlite.prepare(sql);
    if (/\bRETURNING\b/i.test(sql)) {
      const results = prepared.all(...values);
      return { results, meta: { changes: Number(sqlite.prepare('SELECT changes() AS c').get().c) } };
    }
    const info = prepared.run(...values);
    return { results: [], meta: { changes: Number(info.changes) } };
  }
  return {
    prepare: sql => statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) {
          if (/^\s*(SELECT|WITH)\b/i.test(item.sql)) results.push({ results: sqlite.prepare(item.sql).all(...item.values), meta: { changes: 0 } });
          else results.push(exec(item.sql, item.values));
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    raw: sqlite
  };
}
