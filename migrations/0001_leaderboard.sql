CREATE TABLE totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  games_played INTEGER NOT NULL DEFAULT 0
);
INSERT INTO totals (id) VALUES (1);

-- Run IDs are random, short-lived receipts, not visitor identifiers.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL
);
CREATE INDEX runs_started_at ON runs (started_at);
CREATE TRIGGER count_new_game AFTER INSERT ON runs BEGIN
  UPDATE totals SET games_played = games_played + 1 WHERE id = 1;
END;

CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score > 0 AND score % 100 = 0),
  wave INTEGER NOT NULL CHECK (wave > 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX scores_ranking ON scores (score DESC, wave DESC, id ASC);
