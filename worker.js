const RUN_LIFETIME = 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOP_SCORES = 'SELECT id, name, score, wave FROM scores ORDER BY score DESC, wave DESC, id ASC LIMIT 10';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    },
  });
}

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'Send JSON with this request.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Missing request body.');
  let text = '';
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024) {
      await reader.cancel();
      throw new ApiError(413, 'Request is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const body = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ApiError(400, 'Invalid JSON.');
  }
}

async function snapshot(db) {
  const [scores, totals] = await db.batch([
    db.prepare(TOP_SCORES),
    db.prepare('SELECT games_played AS gamesPlayed FROM totals WHERE id = 1'),
  ]);
  return { entries: scores.results, gamesPlayed: totals.results[0].gamesPlayed };
}

async function startRun(db, body, now) {
  if (typeof body.runId !== 'string' || !UUID.test(body.runId)) {
    throw new ApiError(400, 'Invalid game receipt.');
  }
  // The insert trigger counts once, even for concurrent requests or retries.
  await db.batch([
    db.prepare('DELETE FROM runs WHERE started_at < ?').bind(now - RUN_LIFETIME),
    db.prepare('INSERT OR IGNORE INTO runs (id, started_at) VALUES (?, ?)').bind(body.runId, now),
  ]);
  const totals = await db.prepare('SELECT games_played AS gamesPlayed FROM totals WHERE id = 1').first();
  return { runId: body.runId, gamesPlayed: totals.gamesPlayed };
}

async function saveScore(db, body, now) {
  const { runId, score, wave } = body;
  const name = typeof body.name === 'string' ? body.name.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (typeof runId !== 'string' || !UUID.test(runId)) throw new ApiError(400, 'Invalid game receipt.');
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]{0,11}$/u.test(name)) {
    throw new ApiError(400, 'Use 1–12 letters or numbers, with spaces, dots, hyphens, or underscores.');
  }
  if (!Number.isSafeInteger(score) || score <= 0 || score > 10000000 || score % 100 !== 0
    || !Number.isSafeInteger(wave) || wave < 1 || wave > 10000 || score > wave * 5400) {
    throw new ApiError(400, 'Invalid score or wave.');
  }
  const run = await db.prepare('SELECT started_at FROM runs WHERE id = ?').bind(runId).first();
  if (!run || now - run.started_at > RUN_LIFETIME) throw new ApiError(410, 'This game receipt has expired. Start a new game.');
  const elapsed = now - run.started_at;
  if (elapsed < 1 || elapsed < (wave - 1) * 6 || score > elapsed * 2000 + 1000) {
    throw new ApiError(400, 'This score could not have been reached in this game.');
  }
  // A unique run_id makes submitting twice harmless, including after a timeout.
  await db.prepare('INSERT OR IGNORE INTO scores (run_id, name, score, wave, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(runId, name, score, wave, now).run();
  const saved = await db.prepare('SELECT id, name, score, wave FROM scores WHERE run_id = ?').bind(runId).first();
  if (saved.name !== name || saved.score !== score || saved.wave !== wave) {
    throw new ApiError(409, 'A score has already been saved for this game.');
  }
  const board = await snapshot(db);
  const place = board.entries.findIndex((entry) => entry.id === saved.id);
  return { ...board, rank: place < 0 ? null : place + 1 };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        return json(await snapshot(env.DB));
      }
      if (!['/api/runs', '/api/scores'].includes(url.pathname)) throw new ApiError(404, 'Not found.');
      if (request.method !== 'POST') throw new ApiError(405, 'Use POST for this request.');
      const origin = request.headers.get('Origin');
      if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
        throw new ApiError(403, 'Use the game website to submit scores.');
      }
      // Connection IPs are used transiently for abuse limits, never stored in D1.
      const { success } = await env.WRITE_LIMITER.limit({
        key: request.headers.get('CF-Connecting-IP') || 'local',
      });
      if (!success) throw new ApiError(429, 'Too many requests. Please try again in a minute.');
      const body = await readBody(request);
      const now = Math.floor(Date.now() / 1000);
      return json(url.pathname === '/api/runs'
        ? await startRun(env.DB, body, now)
        : await saveScore(env.DB, body, now));
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error('Leaderboard request failed:', error.message);
      return json({ error: 'The leaderboard is unavailable. You can still play.' }, 503);
    }
  },
};
