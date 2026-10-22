function randomRunId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues also works on HTTP when previewing from a phone on the LAN.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function setupCommunity({ root = document, fetcher = fetch, makeId = randomRunId } = {}) {
  const rows = root.querySelector('[data-leaderboard-rows]');
  const counter = root.querySelector('[data-games-played]');
  const boardStatus = root.querySelector('[data-leaderboard-status]');
  const retry = root.querySelector('[data-leaderboard-retry]');
  const form = root.querySelector('[data-score-form]');
  const name = root.querySelector('[data-player-name]');
  const save = root.querySelector('[data-save-score]');
  const scoreStatus = root.querySelector('[data-score-status]');
  let entries = null;
  let gamesPlayed = 0;
  let boardVersion = 0;
  let activeGame;

  async function api(path, body) {
    const response = await fetcher(`/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Please try again.');
    return data;
  }

  function updateCounter(count) {
    gamesPlayed = Math.max(gamesPlayed, count);
    counter.textContent = gamesPlayed.toLocaleString();
  }

  function renderBoard(data) {
    entries = data.entries;
    updateCounter(data.gamesPlayed);
    rows.replaceChildren();
    if (!entries.length) {
      const row = root.createElement('tr');
      const cell = root.createElement('td');
      cell.colSpan = 4;
      cell.className = 'leaderboard-empty';
      cell.textContent = 'No scores yet. Set the first high score.';
      row.append(cell);
      rows.append(row);
    }
    entries.forEach((entry, index) => {
      const row = root.createElement('tr');
      for (const value of [String(index + 1).padStart(2, '0'), entry.name, entry.score.toLocaleString(), String(entry.wave).padStart(2, '0')]) {
        const cell = root.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    });
    boardStatus.textContent = '';
    retry.hidden = true;
  }

  async function refresh() {
    const version = ++boardVersion;
    boardStatus.textContent = 'Loading scores…';
    retry.hidden = true;
    try {
      const data = await api('leaderboard');
      if (version === boardVersion) renderBoard(data);
      return data;
    } catch {
      if (version === boardVersion) {
        boardStatus.textContent = 'Leaderboard unavailable. You can still play.';
        retry.hidden = false;
      }
      return null;
    }
  }

  function startGame() {
    form.hidden = true;
    save.disabled = false;
    scoreStatus.textContent = '';
    const run = { runId: makeId() };
    activeGame = run;
    run.ready = api('runs', { runId: run.runId }).then((data) => {
      updateCounter(data.gamesPlayed);
      return true;
    }).catch(() => false);
  }

  async function finishGame(score, wave) {
    const run = activeGame;
    run.score = score;
    run.wave = wave;
    scoreStatus.textContent = score > 0 ? 'Checking the leaderboard…' : 'Score points to join the top 10.';
    const registered = await run.ready;
    if (activeGame !== run || score <= 0) return;
    if (!registered) {
      scoreStatus.textContent = 'Scores are offline for this game. You can still play again.';
      return;
    }
    await refresh();
    if (activeGame !== run) return;
    const last = entries?.[9];
    const qualifies = !last || score > last.score || (score === last.score && wave > last.wave);
    if (!qualifies) {
      scoreStatus.textContent = 'Keep going—the top 10 is within reach.';
      return;
    }
    form.hidden = false;
    scoreStatus.textContent = 'Top 10 contender! Enter a name to save your score.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const run = activeGame;
    if (!run || save.disabled || form.hidden) return;
    save.disabled = true;
    scoreStatus.textContent = 'Saving score…';
    const version = ++boardVersion;
    try {
      const data = await api('scores', { runId: run.runId, name: name.value, score: run.score, wave: run.wave });
      if (version === boardVersion) renderBoard(data);
      else void refresh();
      if (activeGame !== run) return;
      form.hidden = true;
      scoreStatus.textContent = data.rank ? `You’re #${data.rank} on the leaderboard!` : 'Score saved. The top 10 has moved on!';
    } catch (error) {
      if (activeGame === run) {
        scoreStatus.textContent = error.name === 'TimeoutError' || error instanceof TypeError
          ? 'Couldn’t save your score. Please try again.' : error.message;
        save.disabled = false;
      }
    }
  });

  retry.addEventListener('click', refresh);
  void refresh();
  return { startGame, finishGame, refresh };
}
