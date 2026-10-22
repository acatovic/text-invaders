import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker.js';

// Real SQLite executes the production migration and queries; this small adapter
// supplies D1's statement interface without a network connection or account.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_leaderboard.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        first() { return sqlite.prepare(sql).get(...values) ?? null; },
        all() { return { results: sqlite.prepare(sql).all(...values) }; },
        run() { return { meta: sqlite.prepare(sql).run(...values), results: [] }; },
        execute() { return /^(SELECT)/i.test(sql) ? this.all() : this.run(); },
      };
    },
    batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}

function api() {
  const { sqlite, db } = database();
  const env = {
    DB: db,
    WRITE_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response('game assets') },
  };
  async function request(path, body, options = {}) {
    const response = await worker.fetch(new Request(`https://txtinvaders.test${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
      ...options,
    }), env);
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  async function run(age = 60) {
    const runId = crypto.randomUUID();
    assert.equal((await request('/api/runs', { runId })).status, 200);
    sqlite.prepare('UPDATE runs SET started_at = started_at - ? WHERE id = ?').run(age, runId);
    return runId;
  }
  return { request, run, env, sqlite };
}

test('counts starts once, including concurrent retries; reads do not count', async () => {
  const { request } = api();
  assert.deepEqual((await request('/api/leaderboard')).data, { entries: [], gamesPlayed: 0 });
  const runId = crypto.randomUUID();
  const starts = await Promise.all(Array.from({ length: 6 }, () => request('/api/runs', { runId })));
  starts.forEach(({ status, data }) => { assert.equal(status, 200); assert.equal(data.gamesPlayed, 1); });
  assert.equal((await request('/api/leaderboard')).data.gamesPlayed, 1);
  await request('/api/runs', { runId: crypto.randomUUID() });
  assert.equal((await request('/api/leaderboard')).data.gamesPlayed, 2);
});

test('scores are shared, ordered, limited to ten, and submitted idempotently', async () => {
  const { request, run, sqlite } = api();
  const first = { runId: await run(), name: '  Årmin  ', score: 100, wave: 1 };
  const results = await Promise.all([request('/api/scores', first), request('/api/scores', first)]);
  results.forEach(({ status, data }) => { assert.equal(status, 200); assert.equal(data.rank, 1); });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 1);
  assert.equal((await request('/api/scores', { ...first, score: 200 })).status, 409);
  for (let i = 2; i <= 12; i++) {
    assert.equal((await request('/api/scores', { runId: await run(), name: `Player ${i}`, score: i * 100, wave: 1 })).status, 200);
  }
  const { data, headers } = await request('/api/leaderboard');
  assert.equal(data.gamesPlayed, 12);
  assert.equal(data.entries.length, 10);
  assert.equal(data.entries[0].score, 1200);
  assert.equal(data.entries[9].score, 300);
  assert.ok(data.entries.every((entry) => !('runId' in entry) && !('run_id' in entry)));
  assert.equal(headers.get('Cache-Control'), 'no-store');
  assert.equal(headers.get('Set-Cookie'), null);
});

test('ties favor the higher wave, then the earlier saved score', async () => {
  const { request, run } = api();
  for (const [name, wave] of [['First', 1], ['Second', 1], ['Further', 2]]) {
    await request('/api/scores', { runId: await run(), name, wave, score: 100 });
  }
  assert.deepEqual((await request('/api/leaderboard')).data.entries.map(({ name }) => name), ['Further', 'First', 'Second']);
});

test('rejects forged receipts, bad names, implausible scores, and expired runs', async () => {
  const { request, run, sqlite } = api();
  const runId = await run();
  const valid = { runId, name: 'Alice', score: 100, wave: 1 };
  for (const invalid of [
    { name: '<script>' }, { name: 'a'.repeat(13) }, { name: '' },
    { score: -100 }, { score: 101 }, { score: '100' }, { score: 10000 },
    { wave: 0 }, { wave: 9999 }, { runId: 'fake' },
  ]) {
    assert.equal((await request('/api/scores', { ...valid, ...invalid })).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await request('/api/scores', { ...valid, runId: crypto.randomUUID() })).status, 410);
  const tooFast = await run(0);
  assert.equal((await request('/api/scores', { ...valid, runId: tooFast })).status, 400);
  sqlite.prepare('UPDATE runs SET started_at = started_at - 86401 WHERE id = ?').run(runId);
  assert.equal((await request('/api/scores', valid)).status, 410);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 0);
});

test('blocks cross-site writes, oversized and malformed bodies, and rapid requests', async () => {
  const { request, env } = api();
  const body = { runId: crypto.randomUUID() };
  assert.equal((await request('/api/runs', body, { headers: { Origin: 'https://elsewhere.test' } })).status, 403);
  assert.equal((await request('/api/runs', 'x'.repeat(1025))).status, 413);
  assert.equal((await request('/api/runs', '{')).status, 400);
  assert.equal((await request('/api/runs', body, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('/api/runs')).status, 405);
  assert.equal((await request('/api/unknown')).status, 404);
  env.WRITE_LIMITER.limit = async () => ({ success: false });
  const limited = await request('/api/runs', body);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
});
